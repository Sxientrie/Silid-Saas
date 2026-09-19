export interface Branch {
  id: string
  name: string
}

export interface RateConfig {
  id: string
  name: string
  rate_config: {
    canteen?: Record<string, number>
    [key: string]: unknown
  }
}
