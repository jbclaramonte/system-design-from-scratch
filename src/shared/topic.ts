/** Topic and Notion types shared by the main process and the renderer (Lesson view). */

/** A notion of a topic's Notion Outline, as the renderer sees it. */
export interface NotionRef {
  id: number
  slug: string
  /** French title. */
  title: string
  description: string | null
}

/** A Topic in Learning Path order, with whether its Notion Outline exists yet. */
export interface TopicSummary {
  id: number
  /** Stable slug: the Source Corpus topic id for primer topics. */
  slug: string
  title: string
  position: number
  inFoundationsModule: boolean
  /**
   * Generated from primer excerpts. False for a Foundations Module topic that declares no
   * grounding sections (ungrounded, shown "Outside the primer").
   */
  grounded: boolean
  /** Number of notions of its Notion Outline, 0 while the outline is not generated. */
  notionCount: number
}

/** The Notion Outline is generated once, the first time a lesson or quiz of the topic opens. */
export type NotionOutlineStatus = { status: 'missing' } | { status: 'ready'; notions: NotionRef[] }

export interface TopicDetail extends TopicSummary {
  notionOutline: NotionOutlineStatus
}

export interface TopicGetRequest {
  topicId: number
}
