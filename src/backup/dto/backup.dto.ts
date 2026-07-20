import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBackupDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;
}

export class RestoreBackupDto {
  /** Must be exactly RESTORE */
  @IsString()
  confirmationPhrase!: string;
}
