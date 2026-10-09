import type { Migration } from '../migrate'
import { initialSchema } from './0001-initial-schema'

/** Every migration, in order. Append new ones; never edit or reorder an applied one. */
export const migrations: readonly Migration[] = [initialSchema]
