import { createSignal, createResource, createEffect, For, Show, createMemo, onCleanup } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { ProviderInfo } from "../../core/agent"
import { startOAuthFlow, completeOAuthFlow, type AuthMethod } from "../../core/auth"
import { getAgentClient } from "../../core/agent"

interface LoginDialogProps {
  providers: ProviderInfo[]
  onClose: () => void
  onAuthenticated: (provider: string) => void
}

type LoginStep = "select-provider" | "select-method" | "oauth-waiting" | "code-input" | "success" | "error"

export const LoginDialog = (props: LoginDialogProps) => {
  let scrollRef: any
  const [step, setStep] = createSignal<LoginStep>("select-provider")
  const [providerIdx, setProviderIdx] = createSignal(0)
  const [methodIdx, setMethodIdx] = createSignal(0)
  const [activeProviderId, setActiveProviderId] = createSignal<string | null>(null)
  const [activeMethodIdx, setActiveMethodIdx] = createSignal(0)
  const [oauthUrl, setOauthUrl] = createSignal<string | null>(null)
  const [oauthInstructions, setOauthInstructions] = createSignal<string | null>(null)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [statusMsg, setStatusMsg] = createSignal<string | null>(null)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer)
  })

  const [authMethods] = createResource(async () => {
    try {
      return await getAgentClient().getProviderAuthMethods()
    } catch {
      return {} as Record<string, AuthMethod[]>
    }
  })

  const providerList = createMemo(() => {
    return props.providers.map((p) => {
      const methods = authMethods()?.[p.id] ?? []
      return { ...p, methods }
    })
  })

  const currentProvider = createMemo(() => providerList()[providerIdx()])
  const currentMethods = createMemo(() => currentProvider()?.methods ?? [])

  createEffect(() => {
    const idx = providerIdx()
    if (scrollRef) {
      scrollRef.scrollTop = idx
    }
  })

  const openUrl = (url: string) => {
    try {
      Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" })
    } catch {
      try {
        Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" })
      } catch {}
    }
  }

  const checkAuthCompleted = async (providerId: string): Promise<boolean> => {
    try {
      const methods = await getAgentClient().getProviderAuthMethods()
      const providerMethods = methods[providerId]
      if (!providerMethods || providerMethods.length === 0) return true
      return false
    } catch {
      return false
    }
  }

  const startPolling = (providerId: string) => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(async () => {
      const ok = await checkAuthCompleted(providerId)
      if (ok) {
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = null
        setStep("success")
        props.onAuthenticated(providerId)
      }
    }, 3000)
  }

  const startAuth = async (providerId: string, mIdx: number, method: AuthMethod) => {
    setLoading(true)
    setErrorMsg(null)
    setStatusMsg(null)
    setActiveProviderId(providerId)
    setActiveMethodIdx(mIdx)

    const result = await startOAuthFlow(providerId, mIdx)
    setLoading(false)

    if (!result) {
      setErrorMsg(`Failed to start ${method.label} for ${providerId}. Is the provider configured?`)
      setStep("error")
      return
    }

    setOauthUrl(result.url)
    setOauthInstructions(result.instructions || "")
    openUrl(result.url)

    if (result.method === "code") {
      setStep("code-input")
    } else {
      setStep("oauth-waiting")
      setStatusMsg("Waiting for browser authentication...")

      completeOAuthFlow(providerId, mIdx).then((ok) => {
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = null
        if (ok) {
          setStep("success")
          props.onAuthenticated(providerId)
        } else {
          startPolling(providerId)
          setStatusMsg("Polling for completion... Press Enter to verify manually.")
        }
      })
    }
  }

  const handleCodeSubmit = async (code: string) => {
    const providerId = activeProviderId()
    if (!providerId || !code.trim()) return

    setLoading(true)
    const ok = await completeOAuthFlow(providerId, activeMethodIdx(), code.trim())
    setLoading(false)

    if (ok) {
      setStep("success")
      props.onAuthenticated(providerId)
    } else {
      setErrorMsg("Failed to complete authentication with the provided code.")
      setStep("error")
    }
  }

  const manualVerify = async () => {
    const providerId = activeProviderId()
    if (!providerId) return
    setStatusMsg("Checking...")
    const ok = await checkAuthCompleted(providerId)
    if (ok) {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      setStep("success")
      props.onAuthenticated(providerId)
    } else {
      setStatusMsg("Not yet authenticated. Complete the flow in your browser, then press Enter again.")
    }
  }

  useKeyboard((key) => {
    const s = step()

    if (key.name === "escape") {
      if (s === "select-provider") {
        props.onClose()
      } else {
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = null
        setStep("select-provider")
        setErrorMsg(null)
        setStatusMsg(null)
        setOauthUrl(null)
        setOauthInstructions(null)
      }
      return
    }

    if (s === "select-provider") {
      const list = providerList()
      switch (key.name) {
        case "j":
        case "down":
          setProviderIdx((i) => Math.min(i + 1, list.length - 1))
          break
        case "k":
        case "up":
          setProviderIdx((i) => Math.max(i - 1, 0))
          break
        case "return": {
          const prov = list[providerIdx()]
          if (!prov) break
          if (prov.methods.length === 1) {
            startAuth(prov.id, 0, prov.methods[0])
          } else if (prov.methods.length > 1) {
            setMethodIdx(0)
            setStep("select-method")
          }
          break
        }
      }
      return
    }

    if (s === "select-method") {
      const methods = currentMethods()
      switch (key.name) {
        case "j":
        case "down":
          setMethodIdx((i) => Math.min(i + 1, methods.length - 1))
          break
        case "k":
        case "up":
          setMethodIdx((i) => Math.max(i - 1, 0))
          break
        case "return": {
          const m = methods[methodIdx()]
          if (m) {
            startAuth(currentProvider().id, methodIdx(), m)
          }
          break
        }
      }
      return
    }

    if (s === "oauth-waiting") {
      if (key.name === "return") {
        manualVerify()
      }
      return
    }
  })

  return (
    <box
      width="100%"
      height="100%"
      bg="#0d0d1a"
      flexDirection="column"
      padding={2}
    >
    <box
      width="100%"
      flexGrow={1}
      borderStyle="rounded"
      borderColor="#87CEEB"
      bg="#0d0d1a"
      flexDirection="column"
      padding={1}
    >
      <text fg="#87CEEB" bold> Provider Login </text>

      <Show when={step() === "select-provider"}>
        <text fg="#888888"> Enter:authenticate  Esc:close</text>

        <Show when={authMethods.loading}>
          <text fg="#e5c07b" marginTop={1}>Loading providers...</text>
        </Show>

        <Show when={!authMethods.loading && providerList().length === 0}>
          <text fg="#e06c75" marginTop={1}>
            No providers found. Make sure opencode is configured with providers.
          </text>
        </Show>

        <scrollbox ref={scrollRef} flexGrow={1} width="100%" marginTop={1}>
          <box flexDirection="column" width="100%">
            <For each={providerList()}>
              {(prov, i) => {
                const isSelected = createMemo(() => i() === providerIdx())
                const methodLabels = prov.methods.map((m) => m.label || m.type).join(", ")
                return (
                  <box
                    flexDirection="row"
                    width="100%"
                    bg={isSelected() ? "#333355" : undefined}
                  >
                    <text fg={prov.connected ? "#98c379" : "#e06c75"} width={3}>
                      {prov.connected ? " ● " : " ○ "}
                    </text>
                    <text fg={isSelected() ? "#FFFFFF" : "#cccccc"} width={18}>
                      {prov.name}
                    </text>
                    <text fg={prov.connected ? "#98c379" : "#555555"} width={14}>
                      {prov.connected ? "authorized" : "not authorized"}
                    </text>
                    <text fg="#555555" flexGrow={1}>
                      {methodLabels || ""}
                    </text>
                  </box>
                )
              }}
            </For>
          </box>
        </scrollbox>

        <box flexDirection="row" gap={2} marginTop={1}>
          <text fg="#98c379">
            ● {providerList().filter((p) => p.connected).length} authorized
          </text>
          <text fg="#e06c75">
            ○ {providerList().filter((p) => !p.connected).length} not authorized
          </text>
        </box>
      </Show>

      <Show when={step() === "select-method"}>
        <text fg="#cccccc" marginTop={1}>
          Select auth method for {currentProvider()?.name}:
        </text>

        <box flexDirection="column" width="100%" marginTop={1}>
          <For each={currentMethods()}>
            {(method, i) => {
              const isSelected = createMemo(() => i() === methodIdx())
              return (
                <box
                  flexDirection="row"
                  width="100%"
                  bg={isSelected() ? "#333355" : undefined}
                >
                  <text fg={isSelected() ? "#FFFFFF" : "#cccccc"}>
                    {method.label || method.type}
                  </text>
                </box>
              )
            }}
          </For>
        </box>
        <text fg="#666666" marginTop={1}>Enter:select  Esc:back</text>
      </Show>

      <Show when={step() === "oauth-waiting"}>
        <text fg="#cccccc" marginTop={1}>
          Authenticating {activeProviderId()}
        </text>
        <Show when={loading()}>
          <text fg="#e5c07b">Starting auth flow...</text>
        </Show>
        <Show when={oauthUrl()}>
          <text fg="#87CEEB" wrap="word" marginTop={1}>
            Browser opened. Complete the login there.
          </text>
          <Show when={oauthInstructions()}>
            <text fg="#888888" wrap="word">{oauthInstructions()}</text>
          </Show>
          <text fg="#555555" wrap="word" selectable marginTop={1}>
            URL: {oauthUrl()}
          </text>
        </Show>
        <Show when={statusMsg()}>
          <text fg="#e5c07b" marginTop={1}>{statusMsg()}</text>
        </Show>
        <text fg="#666666" marginTop={1}>Enter:verify  Esc:cancel</text>
      </Show>

      <Show when={step() === "code-input"}>
        {(() => {
          let codeInputRef: any
          return (
            <box flexDirection="column" width="100%">
              <text fg="#cccccc" marginTop={1}>
                Enter authorization code for {activeProviderId()}:
              </text>
              <Show when={oauthInstructions()}>
                <text fg="#888888" wrap="word">{oauthInstructions()}</text>
              </Show>
              <Show when={oauthUrl()}>
                <text fg="#555555" wrap="word" selectable marginTop={1}>
                  URL: {oauthUrl()}
                </text>
              </Show>
              <box
                flexDirection="row"
                width="100%"
                borderStyle="single"
                borderColor="#444444"
                marginTop={1}
              >
                <text fg="#555555" width={2}> {">"} </text>
                <input
                  ref={codeInputRef}
                  flexGrow={1}
                  placeholder="Paste authorization code..."
                  focused
                  onSubmit={() => {
                    const code = codeInputRef?.value ?? codeInputRef?.plainText ?? ""
                    handleCodeSubmit(code)
                  }}
                />
              </box>
              <Show when={loading()}>
                <text fg="#e5c07b">Verifying...</text>
              </Show>
              <text fg="#666666" marginTop={1}>Enter:submit  Esc:cancel</text>
            </box>
          )
        })()}
      </Show>

      <Show when={step() === "success"}>
        <text fg="#98c379" bold marginTop={1}>
          Successfully authenticated with {activeProviderId()}!
        </text>
        <text fg="#666666">Press Esc to close</text>
      </Show>

      <Show when={step() === "error"}>
        <text fg="#e06c75" bold marginTop={1}>Error</text>
        <text fg="#e06c75" wrap="word">{errorMsg()}</text>
        <text fg="#666666" marginTop={1}>Esc:back</text>
      </Show>
    </box>
    </box>
  )
}
