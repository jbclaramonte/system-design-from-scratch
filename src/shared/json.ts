/** Any JSON value. Shared so IPC payloads and database columns use the same type. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
