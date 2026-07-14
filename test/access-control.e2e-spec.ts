import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Access Control E2E Tests', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authToken: string;
  let workspaceId: string;
  let userId: string;

  let testRoleId: string;
  let testPermissionSetId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();

    // Clean DB to prevent state interference
    await prisma.accessReview.deleteMany({});
    await prisma.permission.deleteMany({});
    await prisma.customRole.deleteMany({});
    await prisma.permissionSet.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.workspace.deleteMany({});

    // Register a new tenant workspace (this auto-seeds roles/permissions)
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'admin@test-access.com',
        password: 'Password123!',
        workspaceName: 'Test Access Org',
      });

    expect(registerRes.status).toBe(201);
    workspaceId = registerRes.body.workspaceId;
    userId = registerRes.body.userId;

    // Login to obtain JWT Token
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@test-access.com',
        password: 'Password123!',
      });

    expect(loginRes.status).toBe(201);
    authToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auto-Seeding Verification', () => {
    it('should verify that standard permission sets and roles were seeded during registration', async () => {
      const rolesRes = await request(app.getHttpServer())
        .get('/roles')
        .set('Authorization', `Bearer ${authToken}`);

      expect(rolesRes.status).toBe(200);
      expect(rolesRes.body.length).toBe(2); // Owner and Admin only

      const pSetsRes = await request(app.getHttpServer())
        .get('/permission-sets')
        .set('Authorization', `Bearer ${authToken}`);

      expect(pSetsRes.status).toBe(200);
      expect(pSetsRes.body.length).toBe(12); // Users, Settings, Billing, Reports, Campaigns, Contacts, Sender IDs, Roles, Dashboard Access, Log, SMS Template, Groups
    });
  });

  describe('Roles Endpoint', () => {
    it('should create a new custom role', async () => {
      const pSetsRes = await request(app.getHttpServer())
        .get('/permission-sets')
        .set('Authorization', `Bearer ${authToken}`);

      const pSetIds = pSetsRes.body.map((p: any) => p.id);

      const createRes = await request(app.getHttpServer())
        .post('/roles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Developer',
          accessLevel: 'Scoped',
          description: 'Software development team access',
          permissionSetIds: [pSetIds[0], pSetIds[1]],
          status: 'Active',
          owner: 'System',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.name).toBe('Developer');
      expect(createRes.body.permissionSets.length).toBe(2);
      testRoleId = createRes.body.id;
    });

    it('should retrieve roles with search filter', async () => {
      const searchRes = await request(app.getHttpServer())
        .get('/roles?search=dev')
        .set('Authorization', `Bearer ${authToken}`);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.length).toBe(1);
      expect(searchRes.body[0].name).toBe('Developer');
    });

    it('should update a role', async () => {
      const updateRes = await request(app.getHttpServer())
        .patch(`/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Updated software development team access',
          status: 'Needs review',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.description).toBe(
        'Updated software development team access',
      );
      expect(updateRes.body.status).toBe('Needs review');
    });

    it('should perform access review on a role', async () => {
      const reviewRes = await request(app.getHttpServer())
        .post(`/roles/${testRoleId}/review`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notes: 'Role assignments and permission levels verified.',
        });

      expect(reviewRes.status).toBe(201);
      expect(reviewRes.body.status).toBe('Approved');
      expect(reviewRes.body.notes).toBe(
        'Role assignments and permission levels verified.',
      );

      // Role status should now be Active
      const roleRes = await request(app.getHttpServer())
        .get(`/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(roleRes.body.status).toBe('Active');
      expect(roleRes.body.lastReview).toBeDefined();
    });
  });

  describe('Permission Sets Endpoint', () => {
    it('should create a custom permission set', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/permission-sets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Campaign Manager Set',
          description: 'Permissions for campaign managers',
          permissions: [
            { action: 'CREATE', subject: 'CAMPAIGNS' },
            { action: 'READ', subject: 'CAMPAIGNS' },
          ],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.name).toBe('Campaign Manager Set');
      expect(createRes.body.permissions.length).toBe(2);
      testPermissionSetId = createRes.body.id;
    });

    it('should delete a custom permission set', async () => {
      const deleteRes = await request(app.getHttpServer())
        .delete(`/permission-sets/${testPermissionSetId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteRes.status).toBe(200);

      const checkRes = await request(app.getHttpServer())
        .get(`/permission-sets/${testPermissionSetId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(checkRes.status).toBe(404);
    });
  });

  describe('Access Reviews Endpoint', () => {
    it('should list all completed access review logs', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/access-reviews')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBeGreaterThanOrEqual(1);
      expect(listRes.body[0].role.name).toBe('Developer');
      expect(listRes.body[0].reviewer.id).toBe(userId);
    });
  });
});
