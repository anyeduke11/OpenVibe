import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { Toaster, toast } from './components/ui/Toaster'
import { ApiError } from './api/client'
import { PROMPT_STALE_TIME } from './hooks/usePrompts'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: PROMPT_STALE_TIME, refetchOnWindowFocus: false, retry: 0 },
  },
})

// 查询错误统一 toast（dev-plan §5.3）；mutation 错误由调用点就地处理
queryClient.getQueryCache().subscribe((event) => {
  const query = event.query
  const error = query?.state.error
  if (query?.state.status === 'error' && error instanceof ApiError) {
    toast(error.message, 'error')
  }
})

const container = document.getElementById('root')
if (container === null) throw new Error('#root 缺失')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
