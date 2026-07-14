import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Dashboard & Users E2E Tests', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminToken: string;
  let adminUserId: string;
  let workspaceId: string;

  let analystToken: string;
  let analystUserId: string;

  let newUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();

    // Clean DB to avoid test interference
    await prisma.accessReview.deleteMany({});
    await prisma.permission.deleteMany({});
    await prisma.customRole.deleteMany({});
    await prisma.permissionSet.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.workspace.deleteMany({});

    // 1. Register new tenant (which seeds roles, permission sets, and mock users)
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'ceo@enterprise.com',
        password: 'Password123!',
        workspaceName: 'Enterprise Holdings',
      });

    expect(registerRes.status).toBe(201);
    workspaceId = registerRes.body.workspaceId;
    adminUserId = registerRes.body.userId;

    // Fetch all permission sets seeded during registration
    const pSets = await prisma.permissionSet.findMany({
      where: { workspaceId },
    });
    const getPSetIds = (names: string[]) => {
      return pSets
        .filter((ps) => names.includes(ps.name))
        .map((ps) => ({ id: ps.id }));
    };

    // Create testing-only Analyst role
    const analystRole = await prisma.customRole.create({
      data: {
        name: 'Analyst',
        accessLevel: 'Scoped',
        description: 'Access to analytics, dashboards, and reporting',
        workspaceId,
        status: 'Active',
        owner: 'System',
        isSystem: true,
        permissionSets: {
          connect: getPSetIds(['Dashboard Access', 'Log', 'Reports']),
        },
      },
    });

    // Create testing-only Workspace Owner role
    const wsOwnerRole = await prisma.customRole.create({
      data: {
        name: 'Workspace Owner',
        accessLevel: 'Full',
        description: 'Full workspace ownership and control',
        workspaceId,
        status: 'Active',
        owner: 'System',
        isSystem: true,
        permissionSets: {
          connect: getPSetIds([
            'Settings',
            'Billing',
            'Campaigns',
            'Contacts',
            'Sender IDs',
            'Users',
            'Roles',
            'Dashboard Access',
            'Log',
            'Reports',
            'SMS Template',
            'Groups',
          ]),
        },
      },
    });

    // Create testing-only Contributor role
    const contributorRole = await prisma.customRole.create({
      data: {
        name: 'Contributor',
        accessLevel: 'Scoped',
        description: 'Platform contributor permissions',
        workspaceId,
        status: 'Active',
        owner: 'System',
        isSystem: true,
        permissionSets: {
          connect: getPSetIds([
            'Campaigns',
            'Contacts',
            'Dashboard Access',
            'Reports',
            'SMS Template',
            'Groups',
          ]),
        },
      },
    });

    // Create testing-only Security Admin role
    const securityAdminRole = await prisma.customRole.create({
      data: {
        name: 'Security Admin',
        accessLevel: 'Full',
        description: 'Access security configurations and logs',
        workspaceId,
        status: 'Active',
        owner: 'System',
        isSystem: true,
        permissionSets: {
          connect: getPSetIds(['Settings', 'Users', 'Roles', 'Log']),
        },
      },
    });

    // Create testing-only Team Lead role
    const teamLeadRole = await prisma.customRole.create({
      data: {
        name: 'Team Lead',
        accessLevel: 'Scoped',
        description: 'Manage operations and teams',
        workspaceId,
        status: 'Active',
        owner: 'System',
        isSystem: true,
        permissionSets: {
          connect: getPSetIds([
            'Campaigns',
            'Contacts',
            'Users',
            'Dashboard Access',
            'Groups',
          ]),
        },
      },
    });

    const adminUser = await prisma.user.update({
      where: { id: adminUserId },
      data: {
        canViewOthers: true,
        canManagePermissions: true,
      },
    });
    const passwordHash = adminUser!.passwordHash;

    const mockUsersData = [
      {
        email: `olivia.rhye+${workspaceId.substring(0, 8)}@weblabs.studio`,
        name: 'Olivia Rhye',
        team: 'Platform',
        customRoleId: wsOwnerRole.id,
      },
      {
        email: `noah.pierre+${workspaceId.substring(0, 8)}@weblabs.studio`,
        name: 'Noah Pierre',
        team: 'Platform',
        customRoleId: contributorRole.id,
      },
      {
        email: `koray.okumus+${workspaceId.substring(0, 8)}@weblabs.studio`,
        name: 'Koray Okumus',
        team: 'Internal Tools',
        customRoleId: securityAdminRole.id,
      },
      {
        email: `candice.wu+${workspaceId.substring(0, 8)}@sandbox.dev`,
        name: 'Candice Wu',
        team: 'Customer Ops',
        customRoleId: teamLeadRole.id,
      },
      {
        email: `nico.arendt+${workspaceId.substring(0, 8)}@sandbox.dev`,
        name: 'Nico Arendt',
        team: 'Customer Ops',
        customRoleId: contributorRole.id,
      },
    ];

    for (const m of mockUsersData) {
      await prisma.user.create({
        data: {
          email: m.email,
          passwordHash,
          name: m.name,
          team: m.team,
          role: 'USER' as any,
          workspaceId,
          customRoleId: m.customRoleId,
          status: 'Active',
          invitedById: adminUserId,
        },
      });
    }

    // 2. Login as the Workspace Owner (Admin)
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'ceo@enterprise.com',
        password: 'Password123!',
      });

    expect(loginRes.status).toBe(201);
    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('User Management Endpoints', () => {
    it('should list all seeded mock users inside the workspace', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      // Admin user + 5 mock seeded users (Olivia Rhye, Noah Pierre, Koray Okumus, Candice Wu, Nico Arendt)
      expect(listRes.body.length).toBe(6);

      const olivia = listRes.body.find((u: any) =>
        u.email.startsWith('olivia.rhye'),
      );
      expect(olivia).toBeDefined();
      expect(olivia.name).toBe('Olivia Rhye');
      expect(olivia.team).toBe('Platform');
      expect(olivia.customRole.name).toBe('Workspace Owner');
    });

    it('should search users by name or email', async () => {
      const searchRes = await request(app.getHttpServer())
        .get('/users?search=candice')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.length).toBe(1);
      expect(searchRes.body[0].name).toBe('Candice Wu');
      expect(searchRes.body[0].team).toBe('Customer Ops');
    });

    it('should filter users by team and status', async () => {
      const filterRes = await request(app.getHttpServer())
        .get('/users?team=Customer%20Ops&status=Active')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(filterRes.status).toBe(200);
      // Candice Wu and Nico Arendt are in Customer Ops
      expect(filterRes.body.length).toBe(2);
    });

    it('should add a new user to the workspace', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'designer@weblabs.studio',
          name: 'Sarah Connor',
          team: 'Design Team',
          status: 'Active',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.name).toBe('Sarah Connor');
      newUserId = createRes.body.id;
    });

    it('should update user details', async () => {
      const updateRes = await request(app.getHttpServer())
        .patch(`/users/${newUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          team: 'UX Design Platform',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.team).toBe('UX Design Platform');
    });

    it('should deactivate a user', async () => {
      const deactivateRes = await request(app.getHttpServer())
        .post(`/users/${newUserId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deactivateRes.status).toBe(201);
      expect(deactivateRes.body.status).toBe('Inactive');
    });
  });

  describe('Dashboard Endpoints', () => {
    it('should fetch admin statistics for reseller/platform admin', async () => {
      const statsRes = await request(app.getHttpServer())
        .get('/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.userType).toBe('Admin');
      expect(statsRes.body.activeUsersCount).toBeDefined();
      expect(statsRes.body.totalWorkspacesCount).toBeDefined();
    });

    it('should compile full sidebar menu options for Owner/Admin', async () => {
      const menuRes = await request(app.getHttpServer())
        .get('/dashboard/menu')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(menuRes.status).toBe(200);
      const menuNames = menuRes.body.map((item: any) => item.name);
      expect(menuNames).toContain('Dashboard');
      expect(menuNames).toContain('Users');
      expect(menuNames).toContain('Roles');
      expect(menuNames).toContain('Settings');
      expect(menuNames).toContain('Billing');
    });
  });

  describe('Dynamic Sidebar & Policies Enforcement', () => {
    it('should create restricted Analyst user and verify restricted permissions', async () => {
      // 1. Fetch Analyst Custom Role seeded during onboarding
      const roles = await prisma.customRole.findMany({
        where: { workspaceId, name: 'Analyst' },
      });
      const analystRole = roles[0];
      expect(analystRole).toBeDefined();

      // 2. Create a new user with Analyst role
      const analystUser = await prisma.user.create({
        data: {
          email: 'analyst@weblabs.studio',
          passwordHash: await prisma.user
            .findUnique({ where: { id: adminUserId } })
            .then((u) => u!.passwordHash),
          name: 'Analyst User',
          team: 'Analytics Team',
          role: 'USER',
          workspaceId,
          customRoleId: analystRole.id,
          status: 'Active',
        },
      });
      analystUserId = analystUser.id;

      // 3. Login as Analyst User
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'analyst@weblabs.studio',
          password: 'Password123!',
        });

      expect(loginRes.status).toBe(201);
      analystToken = loginRes.body.accessToken;
    });

    it('should verify that restricted user menu does NOT contain unauthorized items', async () => {
      const menuRes = await request(app.getHttpServer())
        .get('/dashboard/menu')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(menuRes.status).toBe(200);
      const menuNames = menuRes.body.map((item: any) => item.name);

      // Analyst has Dashboards, Analytics, and Reports permission sets
      expect(menuNames).toContain('Dashboard');

      // Should NOT contain administrative components
      expect(menuNames).not.toContain('Users');
      expect(menuNames).not.toContain('Roles');
      expect(menuNames).not.toContain('Settings');
      expect(menuNames).not.toContain('Billing');
    });

    it('should prevent restricted user from accessing /users API (403 Forbidden)', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${analystToken}`);

      expect(listRes.status).toBe(403); // Forbidden
    });
  });
});
