import type { Json } from '../types'

/** SQLite has no boolean type: booleans are stored as 0 or 1. */
export const toFlag = (value: boolean): number => (value ? 1 : 0)
export const fromFlag = (value: number): boolean => value === 1

export const toJson = (value: Json | readonly string[]): string => JSON.stringify(value)
export const fromJson = <T = Json>(value: string): T => JSON.parse(value) as T

/** `SELECT` fragment for the shared timestamp columns. */
export const TIMESTAMP_COLUMNS = 'created_at AS createdAt, updated_at AS updatedAt'

/** SQL expression for the current time as an ISO 8601 string. */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

/** Parses a comma-separated list of ids produced by `group_concat`. */
export const fromIdList = (value: string | null): number[] =>
  value ? value.split(',').map(Number) : []
