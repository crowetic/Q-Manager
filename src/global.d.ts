export {}

declare global {
  interface QortalRequestOptions {
    action: string
    name?: string
    service?: string
    data64?: string
    title?: string
    description?: string
    category?: string
    tags?: string[]
    identifier?: string
    address?: string
    metaData?: string
    encoding?: string
    includeMetadata?: boolean
    limit?: number
    offset?: number
    reverse?: boolean
    resources?: any[]
    filename?: string
    list_name?: string
    item?: string
    items?: string[]
    tag1?: string
    tag2?: string
    tag3?: string
    tag4?: string
    tag5?: string
    coin?: string
    destinationAddress?: string
    amount?: number
    blob?: Blob
    mimeType?: string
    file?: File
    encryptedData?: string
    prefix?: boolean
    exactMatchNames?: boolean
  }

  function qortalRequest(options: QortalRequestOptions): Promise<any>
  function qortalRequestWithTimeout(
    options: QortalRequestOptions,
    time: number
  ): Promise<any>

  interface Window {
    _qdnBase: any
    _qdnTheme: string
    qappCore?: {
      request?: (options: QortalRequestOptions) => Promise<any>
      qortalRequest?: (options: QortalRequestOptions) => Promise<any>
    }
    QAppCore?: {
      request?: (options: QortalRequestOptions) => Promise<any>
    }
    qapp?: {
      request?: (options: QortalRequestOptions) => Promise<any>
      qortalRequest?: (options: QortalRequestOptions) => Promise<any>
    }
  }
}
