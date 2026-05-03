type RequestFn = (options: Record<string, any>) => Promise<any>

const isFunction = (value: unknown): value is RequestFn =>
	typeof value === 'function'

const getWindowRef = (): any => {
	if (typeof window === 'undefined') return undefined
	return window as any
}

const getGlobalQortalRequest = (): RequestFn | null => {
	try {
		if (typeof qortalRequest === 'function') {
			return qortalRequest as RequestFn
		}
	} catch (error) {}
	return null
}

const resolveProvider = (): { name: string; request: RequestFn } | null => {
	const win = getWindowRef()

	const qappCoreRequest =
		win?.qappCore?.request ||
		win?.QAppCore?.request ||
		win?.qappCore?.qortalRequest
	if (isFunction(qappCoreRequest)) {
		return {
			name: 'qapp-core',
			request: qappCoreRequest,
		}
	}

	const qappRequest = win?.qapp?.request || win?.qapp?.qortalRequest
	if (isFunction(qappRequest)) {
		return {
			name: 'qapp',
			request: qappRequest,
		}
	}

	const legacyRequest = getGlobalQortalRequest()
	if (legacyRequest) {
		return {
			name: 'legacy-qortalRequest',
			request: legacyRequest,
		}
	}

	return null
}

export const getQortalRequestProvider = (): string => {
	const provider = resolveProvider()
	return provider?.name || 'none'
}

export const requestQortal = async (
	options: Record<string, any>
): Promise<any> => {
	const provider = resolveProvider()
	if (!provider) {
		throw new Error(
			'No Qortal request provider found (qapp-core, qapp, or qortalRequest)'
		)
	}
	return provider.request(options)
}

