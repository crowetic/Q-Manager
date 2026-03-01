export function objectToBase64(obj: unknown): Promise<string> {
	const jsonString = JSON.stringify(obj)
	const blob = new Blob([jsonString], { type: 'application/json' })

	return new Promise<string>((resolve, reject) => {
		const localReader = new FileReader()
		localReader.onloadend = () => {
			if (typeof localReader.result === 'string') {
				const base64 = localReader.result.replace(
					'data:application/json;base64,',
					''
				)
				resolve(base64)
			} else {
				reject(new Error('Failed to read the Blob as a base64-encoded string'))
			}
		}
		localReader.onerror = () => {
			reject(localReader.error ?? new Error('Failed to read the file'))
		}
		localReader.readAsDataURL(blob)
	})
}

export function base64ToUint8Array(base64: string): Uint8Array {
	const binaryString = atob(base64)
	const len = binaryString.length
	const bytes = new Uint8Array(len)

	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i)
	}

	return bytes
}

export function uint8ArrayToObject<T = unknown>(uint8Array: Uint8Array): T {
	const decoder = new TextDecoder()
	const jsonString = decoder.decode(uint8Array)
	return JSON.parse(jsonString) as T
}

export const handleImportClick = async (): Promise<string> => {
	const fileInput = document.createElement('input')
	fileInput.type = 'file'
	fileInput.accept = '.base64,.txt'

	return new Promise<string>((resolve, reject) => {
		fileInput.onchange = () => {
			const file = fileInput.files?.[0]
			if (!file) {
				reject(new Error('No file selected'))
				return
			}

			const localReader = new FileReader()
			localReader.onload = () => {
				if (typeof localReader.result === 'string') {
					resolve(localReader.result)
				} else {
					reject(new Error('Invalid file content'))
				}
			}
			localReader.onerror = () => {
				reject(localReader.error ?? new Error('Error reading file'))
			}

			localReader.readAsText(file)
		}

		fileInput.click()
	})
}

class Semaphore {
	private count: number
	private waiting: Array<() => void>

	constructor(count: number) {
		this.count = count
		this.waiting = []
	}

	acquire(): Promise<void> {
		return new Promise<void>(resolve => {
			if (this.count > 0) {
				this.count--
				resolve()
			} else {
				this.waiting.push(resolve)
			}
		})
	}

	release(): void {
		if (this.waiting.length > 0) {
			const resolve = this.waiting.shift()
			if (resolve) resolve()
		} else {
			this.count++
		}
	}
}

const semaphore = new Semaphore(1)
let reader: FileReader | null = new FileReader()

export const fileToBase64 = async (file: Blob): Promise<string> => {
	await semaphore.acquire()

	try {
		if (!reader) {
			reader = new FileReader()
		}

		const currentReader = reader as FileReader

		return await new Promise<string>((resolve, reject) => {
			currentReader.onload = () => {
				const dataUrl = currentReader.result
				if (typeof dataUrl === 'string') {
					const base64String = dataUrl.split(',')[1]
					if (base64String === undefined) {
						reject(new Error('Invalid data URL'))
						return
					}
					resolve(base64String)
				} else {
					reject(new Error('Invalid data URL'))
				}
			}

			currentReader.onerror = () => {
				reject(currentReader.error ?? new Error('Failed to read file'))
			}

			currentReader.readAsDataURL(file)
		})
	} finally {
		if (reader) {
			reader.onload = null
			reader.onerror = null
		}
		semaphore.release()
	}
}

const extractNameString = (value: unknown): string => {
	if (typeof value === 'string') {
		return value.trim()
	}
	if (value && typeof value === 'object') {
		const entry = value as Record<string, unknown>
		if (typeof entry.name === 'string') return entry.name.trim()
		if (typeof entry.primaryName === 'string') return entry.primaryName.trim()
	}
	return ''
}

const extractPrimaryName = (payload: unknown): string => {
	if (Array.isArray(payload)) {
		for (const entry of payload) {
			const candidate = extractNameString(entry)
			if (candidate) return candidate
		}
		return ''
	}
	return extractNameString(payload)
}

export const resolvePreferredName = async (
	candidateName?: string,
	candidateAddress?: string
): Promise<string> => {
	if (typeof candidateName === 'string' && candidateName.trim()) {
		return candidateName.trim()
	}

	let resolvedAddress =
		typeof candidateAddress === 'string' && candidateAddress.trim()
			? candidateAddress.trim()
			: ''

	try {
		const primary = await qortalRequest({
			action: 'GET_PRIMARY_NAME',
			...(resolvedAddress ? { address: resolvedAddress } : {}),
		})
		const primaryName = extractPrimaryName(primary)
		if (primaryName) return primaryName
	} catch (error) {}

	if (!resolvedAddress) {
		try {
			const account = await qortalRequest({ action: 'GET_USER_ACCOUNT' })
			if (account?.address && typeof account.address === 'string') {
				resolvedAddress = account.address
			}
		} catch (error) {}
	}

	if (!resolvedAddress) return ''

	try {
		const accountNames = await qortalRequest({
			action: 'GET_ACCOUNT_NAMES',
			address: resolvedAddress,
		})
		if (Array.isArray(accountNames)) {
			for (const entry of accountNames) {
				const name = extractNameString(entry)
				if (name) return name
			}
		}
	} catch (error) {}

	return ''
}
