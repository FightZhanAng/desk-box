import type { DeskboxApi } from '@shared/api'

declare global {
  interface Window {
    deskbox: DeskboxApi
  }
}

export {}
