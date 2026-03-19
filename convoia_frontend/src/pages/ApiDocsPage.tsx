import { useState } from 'react'
import { Copy, Check, Key, BookOpen, Code2, AlertTriangle, Gauge, Package, Play, ChevronRight } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { useModels } from '../hooks/useModels'
import { useToast } from '../hooks/useToast'
import api from '../lib/api'
import { cn } from '../lib/utils'

const sections = [
  { id: 'quickstart', label: 'Quick Start', icon: <Play size={14} /> },
  { id: 'auth', label: 'Authentication', icon: <Key size={14} /> },
  { id: 'chat', label: 'Chat Completions', icon: <Code2 size={14} /> },
  { id: 'models', label: 'List Models', icon: <BookOpen size={14} /> },
  { id: 'errors', label: 'Errors', icon: <AlertTriangle size={14} /> },
  { id: 'ratelimits', label: 'Rate Limits', icon: <Gauge size={14} /> },
  { id: 'sdks', label: 'SDKs', icon: <Package size={14} /> },
]

function CodeSnippet({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group bg-[#1E1E2E] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-3/50 border-b border-border/30">
        <span className="text-xs text-text-muted font-mono">{language}</span>
        <button onClick={handleCopy} className="text-text-muted hover:text-text-primary transition-colors">
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="p-4 text-sm font-mono text-text-secondary overflow-x-auto"><code>{code}</code></pre>
    </div>
  )
}

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div id={id} className="scroll-mt-20 mb-6">
      <h2 className="text-xl font-semibold text-text-primary mb-1">{title}</h2>
      <p className="text-sm text-text-muted">{description}</p>
    </div>
  )
}

export function ApiDocsPage() {
  const [activeSection, setActiveSection] = useState('quickstart')
  const [sdkTab, setSdkTab] = useState('python')
  const [tryModel, setTryModel] = useState('')
  const [tryMessage, setTryMessage] = useState('Hello, how are you?')
  const [tryApiKey, setTryApiKey] = useState('')
  const [tryResult, setTryResult] = useState<string | null>(null)
  const [isTrying, setIsTrying] = useState(false)
  const { models } = useModels()
  const toast = useToast()

  const handleTryIt = async () => {
    if (!tryMessage.trim()) return
    setIsTrying(true)
    setTryResult(null)
    try {
      const res = await api.post('/ai/query', {
        modelId: tryModel || models[0]?.id,
        messages: [{ role: 'user', content: tryMessage }],
      })
      setTryResult(JSON.stringify(res.data, null, 2))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Request failed'
      setTryResult(JSON.stringify({ error: msg }, null, 2))
      toast.error(msg)
    } finally {
      setIsTrying(false)
    }
  }

  return (
    <div className="flex gap-6 -m-4 lg:-m-6 min-h-[calc(100vh-7rem)]">
      {/* Left nav */}
      <div className="w-56 shrink-0 hidden lg:block border-r border-border bg-surface p-4 sticky top-0 h-[calc(100vh-7rem)] overflow-y-auto">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">API Reference</h3>
        <nav className="space-y-1">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                activeSection === s.id ? 'bg-primary/10 text-primary font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              )}
            >
              {s.icon}
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-4xl p-4 lg:p-6 space-y-12">
        {/* Hero */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="primary" size="sm">v1</Badge>
            <Badge size="sm">REST API</Badge>
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">Convoia API Documentation</h1>
          <p className="text-text-muted">
            Access all 16 AI models through a single, OpenAI-compatible API. Use your existing OpenAI SDK or our native endpoints.
          </p>
        </div>

        {/* Quick Start */}
        <section>
          <SectionHeading id="quickstart" title="Quick Start" description="Get started with the Convoia API in 3 steps." />
          <div className="space-y-6">
            <Card padding="lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">1</div>
                <h3 className="font-semibold text-text-primary">Get your API Key</h3>
              </div>
              <p className="text-sm text-text-muted mb-3">
                Generate an API key from the <a href="/api-keys" className="text-primary hover:underline">API Keys page</a>.
                Your key will look like: <code className="bg-surface-2 px-1.5 py-0.5 rounded text-xs">cvai_xxxxxxxxxxxx</code>
              </p>
            </Card>

            <Card padding="lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">2</div>
                <h3 className="font-semibold text-text-primary">Install SDK</h3>
              </div>
              <Tabs
                tabs={[
                  { id: 'python', label: 'Python' },
                  { id: 'javascript', label: 'JavaScript' },
                  { id: 'curl', label: 'cURL' },
                ]}
                activeTab={sdkTab}
                onChange={setSdkTab}
              />
              <div className="mt-3">
                {sdkTab === 'python' && <CodeSnippet language="bash" code="pip install convoia\n# Or use OpenAI SDK:\npip install openai" />}
                {sdkTab === 'javascript' && <CodeSnippet language="bash" code="npm install convoia\n# Or use OpenAI SDK:\nnpm install openai" />}
                {sdkTab === 'curl' && <CodeSnippet language="bash" code="# No installation needed — use cURL directly" />}
              </div>
            </Card>

            <Card padding="lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">3</div>
                <h3 className="font-semibold text-text-primary">Make your first request</h3>
              </div>
              <Tabs
                tabs={[
                  { id: 'python', label: 'Python' },
                  { id: 'javascript', label: 'JavaScript' },
                  { id: 'curl', label: 'cURL' },
                ]}
                activeTab={sdkTab}
                onChange={setSdkTab}
              />
              <div className="mt-3">
                {sdkTab === 'python' && (
                  <CodeSnippet language="python" code={`from convoia import Convoia

client = Convoia(api_key="cvai_xxx")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)`} />
                )}
                {sdkTab === 'javascript' && (
                  <CodeSnippet language="javascript" code={`import Convoia from 'convoia'

const client = new Convoia({ apiKey: 'cvai_xxx' })

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
})

console.log(response.choices[0].message.content)`} />
                )}
                {sdkTab === 'curl' && (
                  <CodeSnippet language="bash" code={`curl https://api.convoia.ai/v1/chat/completions \\
  -H "Authorization: Bearer cvai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`} />
                )}
              </div>
            </Card>
          </div>
        </section>

        {/* Authentication */}
        <section>
          <SectionHeading id="auth" title="Authentication" description="Authenticate your requests with an API key." />
          <Card padding="lg">
            <div className="space-y-4 text-sm text-text-secondary">
              <p>All API requests must include your API key in the <code className="bg-surface-2 px-1.5 py-0.5 rounded text-xs">Authorization</code> header:</p>
              <CodeSnippet language="http" code='Authorization: Bearer cvai_xxxxxxxxxxxx' />
              <h4 className="font-semibold text-text-primary mt-4">Security best practices</h4>
              <ul className="list-disc list-inside space-y-1 text-text-muted">
                <li>Never share your API key or commit it to version control</li>
                <li>Use environment variables to store your key</li>
                <li>Rotate keys regularly and revoke unused ones</li>
                <li>Use separate keys for development and production</li>
              </ul>
            </div>
          </Card>
        </section>

        {/* Chat Completions */}
        <section>
          <SectionHeading id="chat" title="Chat Completions" description="Create chat completions with any supported model." />

          <Card padding="lg" className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="success" size="sm">POST</Badge>
              <code className="text-sm font-mono text-text-primary">/v1/chat/completions</code>
            </div>

            <h4 className="text-sm font-semibold text-text-primary mb-3">Request Body</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Field</th>
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Type</th>
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Required</th>
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono text-xs">model</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3"><Badge size="sm" variant="danger">required</Badge></td>
                    <td className="py-2 px-3">Model ID or name (e.g., "gpt-4o")</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono text-xs">messages</td>
                    <td className="py-2 px-3">array</td>
                    <td className="py-2 px-3"><Badge size="sm" variant="danger">required</Badge></td>
                    <td className="py-2 px-3">Array of message objects with role and content</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono text-xs">stream</td>
                    <td className="py-2 px-3">boolean</td>
                    <td className="py-2 px-3"><Badge size="sm">optional</Badge></td>
                    <td className="py-2 px-3">Enable streaming responses</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono text-xs">temperature</td>
                    <td className="py-2 px-3">number</td>
                    <td className="py-2 px-3"><Badge size="sm">optional</Badge></td>
                    <td className="py-2 px-3">Sampling temperature (0-2, default 0.7)</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono text-xs">max_tokens</td>
                    <td className="py-2 px-3">integer</td>
                    <td className="py-2 px-3"><Badge size="sm">optional</Badge></td>
                    <td className="py-2 px-3">Maximum response tokens</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono text-xs">industry</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3"><Badge size="sm">optional</Badge></td>
                    <td className="py-2 px-3">System prompt industry preset</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Interactive Playground */}
          <Card padding="lg">
            <h4 className="text-sm font-semibold text-text-primary mb-4">Interactive Playground</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">API Key (optional — uses your session if blank)</label>
                <input
                  value={tryApiKey}
                  onChange={(e) => setTryApiKey(e.target.value)}
                  placeholder="cvai_xxxxxxxxxxxx"
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Model</label>
                  <select
                    value={tryModel}
                    onChange={(e) => setTryModel(e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    {models.filter((m) => m.isActive).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Message</label>
                  <input
                    value={tryMessage}
                    onChange={(e) => setTryMessage(e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
              <Button onClick={handleTryIt} isLoading={isTrying} size="sm">
                <Play size={14} /> Try it
              </Button>
              {tryResult && (
                <CodeSnippet language="json" code={tryResult} />
              )}
            </div>
          </Card>
        </section>

        {/* List Models */}
        <section>
          <SectionHeading id="models" title="List Models" description="Retrieve the list of available models." />
          <Card padding="lg">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="info" size="sm">GET</Badge>
              <code className="text-sm font-mono text-text-primary">/v1/models</code>
            </div>
            <p className="text-sm text-text-muted mb-4">Returns all models available to your account with pricing information.</p>
            <CodeSnippet language="json" code={`{
  "data": [
    {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "provider": "openai",
      "contextWindow": 128000,
      "inputTokenPrice": 2.50,
      "outputTokenPrice": 10.00,
      "capabilities": ["vision", "function_calling"]
    }
  ]
}`} />
          </Card>
        </section>

        {/* Errors */}
        <section>
          <SectionHeading id="errors" title="Errors" description="Standard error codes returned by the API." />
          <Card padding="lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Code</th>
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Meaning</th>
                    <th className="text-left py-2 px-3 text-text-muted font-medium">How to Handle</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3"><Badge size="sm" variant="danger">401</Badge></td>
                    <td className="py-2 px-3">Invalid or missing API key</td>
                    <td className="py-2 px-3">Check your API key is correct and active</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3"><Badge size="sm" variant="warning">402</Badge></td>
                    <td className="py-2 px-3">Insufficient wallet balance</td>
                    <td className="py-2 px-3">Top up your wallet at the dashboard</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3"><Badge size="sm" variant="warning">429</Badge></td>
                    <td className="py-2 px-3">Rate limit exceeded</td>
                    <td className="py-2 px-3">Implement exponential backoff and retry</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3"><Badge size="sm" variant="danger">500</Badge></td>
                    <td className="py-2 px-3">Provider error</td>
                    <td className="py-2 px-3">Retry or try a different model/provider</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* Rate Limits */}
        <section>
          <SectionHeading id="ratelimits" title="Rate Limits" description="Per-plan rate limits for API requests." />
          <Card padding="lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Plan</th>
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Requests/min</th>
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Tokens/day</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  <tr className="border-b border-border/50"><td className="py-2 px-3">Free</td><td className="py-2 px-3">10</td><td className="py-2 px-3">50,000</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3">Starter</td><td className="py-2 px-3">30</td><td className="py-2 px-3">500,000</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3">Pro</td><td className="py-2 px-3">60</td><td className="py-2 px-3">2,000,000</td></tr>
                  <tr><td className="py-2 px-3">Business</td><td className="py-2 px-3">120</td><td className="py-2 px-3">10,000,000</td></tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <p className="text-sm text-warning">
                When rate limited, you'll receive a 429 response with a <code className="text-xs bg-surface-2 px-1 py-0.5 rounded">Retry-After</code> header.
                Implement exponential backoff for best results.
              </p>
            </div>
          </Card>
        </section>

        {/* SDKs */}
        <section>
          <SectionHeading id="sdks" title="SDKs & Libraries" description="Official and community SDKs for the Convoia API." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { name: 'Python SDK', lang: 'pip install convoia', status: 'Available' },
              { name: 'JavaScript SDK', lang: 'npm install convoia', status: 'Available' },
              { name: 'Go SDK', lang: 'go get convoia', status: 'Coming Soon' },
              { name: 'Ruby SDK', lang: 'gem install convoia', status: 'Coming Soon' },
            ].map((sdk) => (
              <Card key={sdk.name} padding="md" hover>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-text-primary text-sm">{sdk.name}</h4>
                  <Badge size="sm" variant={sdk.status === 'Available' ? 'success' : 'default'}>{sdk.status}</Badge>
                </div>
                <code className="text-xs font-mono text-text-muted">{sdk.lang}</code>
                {sdk.status === 'Available' && (
                  <div className="flex items-center gap-1 mt-3 text-xs text-primary">
                    View docs <ChevronRight size={12} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default ApiDocsPage;
