import { createSignal, createMemo, createEffect, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { ProviderInfo, ModelInfo } from "../../core/agent"
import { useTheme } from "../../theme/engine"

interface ModelSelectorProps {
  providers: ProviderInfo[]
  currentModel: { providerID: string; modelID: string } | null
  onSelect: (providerID: string, modelID: string) => void
  onClear: () => void
  onClose: () => void
}

interface FlatModel {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
}

export const ModelSelector = (props: ModelSelectorProps) => {
  const theme = useTheme()
  let scrollRef: any
  const [selectedIdx, setSelectedIdx] = createSignal(0)
  const [filter, setFilter] = createSignal("")

  const connectedProviders = createMemo(() =>
    props.providers.filter((p) => p.connected)
  )

  const disconnectedProviders = createMemo(() =>
    props.providers.filter((p) => !p.connected)
  )

  const allModels = createMemo((): FlatModel[] => {
    const result: FlatModel[] = []
    for (const provider of connectedProviders()) {
      for (const [modelID, model] of Object.entries(provider.models)) {
        result.push({
          providerID: provider.id,
          providerName: provider.name,
          modelID,
          modelName: model.name,
        })
      }
    }
    return result
  })

  const filtered = createMemo(() => {
    const f = filter().toLowerCase()
    if (!f) return allModels()
    return allModels().filter(
      (m) =>
        m.modelName.toLowerCase().includes(f) ||
        m.providerName.toLowerCase().includes(f) ||
        m.modelID.toLowerCase().includes(f)
    )
  })

  createEffect(() => {
    const idx = selectedIdx()
    if (scrollRef) {
      scrollRef.scrollTop = idx
    }
  })

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (filter()) {
        setFilter("")
        setSelectedIdx(0)
      } else {
        props.onClose()
      }
      return
    }

    switch (key.name) {
      case "down":
        setSelectedIdx((i) => {
          const max = Math.max(filtered().length - 1, 0)
          return Math.min(i + 1, max)
        })
        break
      case "up":
        setSelectedIdx((i) => Math.max(i - 1, 0))
        break
      case "return": {
        const m = filtered()[selectedIdx()]
        if (m) {
          props.onSelect(m.providerID, m.modelID)
          props.onClose()
        }
        break
      }
      case "d":
        if (key.meta || (key as any).alt === true) {
          props.onClear()
          props.onClose()
        }
        break
    }
  })

  return (
    <box
      width="100%"
      height="100%"
      bg={theme.color("background")}
      flexDirection="column"
      paddingTop={3}
    >
    <box
      width={80}
      maxWidth="100%"
      alignSelf="center"
      borderStyle="single"
      borderColor={theme.color("border")}
      bg={theme.color("backgroundPanel")}
      flexDirection="column"
      padding={1}
    >
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <text fg={theme.color("text")} bold>Select model</text>
        <text fg={theme.color("textMuted")}>esc</text>
      </box>

      <box flexDirection="row" gap={2} width="100%" marginTop={1}>
        <Show when={props.currentModel}>
          <text fg="#555555">
            Current: {props.currentModel!.providerID}/{props.currentModel!.modelID}
          </text>
        </Show>
        <box flexGrow={1} />
        <text fg={theme.color("success")}>{connectedProviders().length} authorized</text>
        <Show when={disconnectedProviders().length > 0}>
          <text fg={theme.color("error")}>{disconnectedProviders().length} not authorized</text>
        </Show>
      </box>

      <box width="100%" height={1} borderStyle="single" borderColor={theme.color("border")} marginTop={1}>
        <text fg={theme.color("textMuted")} width={2}> </text>
        <input
          flexGrow={1}
          value={filter()}
          placeholder="Search"
          focused
          onInput={(v: string) => {
            setFilter(v)
            setSelectedIdx(0)
          }}
        />
      </box>

      <Show when={filtered().length === 0 && !filter()}>
        <box flexDirection="column" width="100%" marginTop={1} padding={1}>
          <text fg={theme.color("error")} bold>No authorized providers</text>
          <text fg={theme.color("textMuted")} marginTop={1}>
            Press Alt+L to open the login dialog and authorize a provider.
          </text>
          <Show when={disconnectedProviders().length > 0}>
            <text fg={theme.color("textMuted")} marginTop={1}>
              Available but not authorized: {disconnectedProviders().map((p) => p.name).join(", ")}
            </text>
          </Show>
        </box>
      </Show>

      <Show when={filtered().length > 0 || filter()}>
        <scrollbox ref={scrollRef} flexGrow={1} width="100%" marginTop={1}>
          <box flexDirection="column" width="100%">
            <For each={filtered()}>
              {(model, i) => {
                const isSelected = createMemo(() => i() === selectedIdx())
                const isCurrent = createMemo(() =>
                  props.currentModel?.providerID === model.providerID &&
                  props.currentModel?.modelID === model.modelID
                )

                return (
                  <box
                    flexDirection="row"
                    width="100%"
                    bg={isSelected() ? theme.color("borderSubtle") : undefined}
                  >
                    <text fg={isSelected() ? theme.color("text") : theme.color("textMuted")} width={2}>
                      {isSelected() ? "›" : " "}
                    </text>
                    <text fg={isCurrent() ? theme.color("success") : theme.color("accent")} width={14}>
                      {model.providerName}
                    </text>
                    <text fg={isSelected() ? theme.color("text") : theme.color("textMuted")} flexGrow={1}>
                      {model.modelName}
                    </text>
                    <Show when={isCurrent()}>
                      <text fg={theme.color("success")}>current</text>
                    </Show>
                  </box>
                )
              }}
            </For>
            <Show when={filtered().length === 0 && filter()}>
              <text fg={theme.color("textMuted")}>No models match filter</text>
            </Show>
          </box>
        </scrollbox>
      </Show>

      <box height={1} width="100%">
        <text fg={theme.color("textMuted")}>
          ↑↓ select  enter confirm  alt+d clear  {filtered().length} models
        </text>
      </box>
    </box>
    </box>
  )
}
