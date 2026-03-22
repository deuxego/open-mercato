import { Migration } from '@mikro-orm/migrations';

export class Migration20260322103416 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "entity_translations" ("id" uuid not null default gen_random_uuid(), "entity_type" text not null, "entity_id" text not null, "organization_id" uuid null, "tenant_id" uuid null, "translations" jsonb not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "entity_translations_pkey" primary key ("id"));`);
    this.addSql(`create index "entity_translations_type_idx" on "entity_translations" ("entity_type");`);
    this.addSql(`create index "entity_translations_entity_idx" on "entity_translations" ("entity_id");`);
    this.addSql(`create index "entity_translations_type_tenant_idx" on "entity_translations" ("entity_type", "tenant_id");`);
  }

}
