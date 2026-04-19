import Dexie, { type Table } from 'dexie';
import type { LogoAsset, Project, Template } from '@/types/editor';

export class AppDB extends Dexie {
  projects!: Table<Project, string>;
  templates!: Table<Template, string>;
  logos!: Table<LogoAsset, string>;

  constructor() {
    super('shorts-pwa');
    this.version(1).stores({
      projects: 'id, updatedAt, createdAt',
      templates: 'id, createdAt',
      logos: 'id',
    });
  }
}

export const db = new AppDB();
