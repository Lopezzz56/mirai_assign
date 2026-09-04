const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000')

export interface ApiError {
  status: number
  detail: any
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 409) {
    const errorData = await response.json()
    throw { status: 409, detail: errorData.detail } as ApiError
  }
  if (!response.ok) throw new Error(`API failed: ${path}`)
  return response.json() as Promise<T>
}
