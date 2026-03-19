import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('convoia_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('convoia_refresh_token')
        if (refresh) {
          const res = await axios.post(
            `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/refresh`,
            { refreshToken: refresh }
          )
          const newToken = res.data.data.token
          localStorage.setItem('convoia_token', newToken)
          original.headers.Authorization = `Bearer ${newToken}`
          return api(original)
        }
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      }
    }

    // Retry on 429 (rate limit) with exponential backoff
    if (error.response?.status === 429 && !original._retryCount) {
      original._retryCount = (original._retryCount || 0) + 1
      if (original._retryCount <= 3) {
        const delay = Math.pow(2, original._retryCount) * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
        return api(original)
      }
    }

    if (error.response?.status === 402) {
      window.dispatchEvent(
        new CustomEvent('wallet:insufficient', {
          detail: error.response.data,
        })
      )
    }

    return Promise.reject(error)
  }
)

export default api
