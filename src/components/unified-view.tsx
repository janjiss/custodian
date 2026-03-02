import { createSignal, createEffect, createMemo, onMount, onCleanup, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useAgent } from "../hooks/use-agent"
import { useGitDiff, type DiffSource } from "../hooks/use-git"
import { useDiffNavigation } from "../hooks/use-diff"
import { GitService } from "../core/git"
import { updateDiffContext, clearDiffContext } from "../core/diff-context"
import { ThreePane, type Pane, type LayoutMode } from "./layout/three-pane"
import { StatusBar } from "./layout/status-bar"
import { DiffViewer } from "./review/diff-viewer"
import { Chat } from "./agent/chat"
import { MessageInput } from "./agent/message-input"
import { PermissionBar } from "./agent/permission-bar"
import { QuestionBar } from "./agent/question-bar"
import { ModelSelector } from "./agent/model-selector"
import { SessionDialog } from "./agent/session-dialog"
import { LoginDialog } from "./agent/login-dialog"
import { statusChar, formatStats } from "../core/diff"
import { useTheme } from "../theme/engine"
import { getLeaderConfig, getKeyName, keyMatches } from "../core/keybindings"

export const UnifiedView = () => {
  const theme = useTheme()
  const agent = useAgent()
  const [diffSource, setDiffSource] = createSignal<DiffSource>({ type: "working" })
  const { diffs, stagedDiffs, workingDiffs, loading, fetchDiff } = useGitDiff(diffSource)
  const allDiffs = createMemo(() => [...stagedDiffs(), ...workingDiffs()])
  const nav = useDiffNavigation(allDiffs)

  const [focusedPane, setFocusedPane] = createSignal<Pane>("chat")
  const [layoutMode, setLayoutMode] = createSignal<LayoutMode>("all")
  const [paneWidths, setPaneWidths] = createSignal({ files: 18, chat: 57, diff: 25 })
  const [contextFiles, setContextFiles] = createSignal<Set<string>>(new Set())
  const [showModelSelector, setShowModelSelector] = createSignal(false)
  const [showSessions, setShowSessions] = createSignal(false)
  const [showLogin, setShowLogin] = createSignal(false)
  const [showThinking, setShowThinking] = createSignal(true)
  const [showToolDetails, setShowToolDetails] = createSignal(true)
  const [leaderArmed, setLeaderArmed] = createSignal(false)
  const [suppressInputUntil, setSuppressInputUntil] = createSignal(0)
  const leader = getLeaderConfig()
  let leaderTimer: ReturnType<typeof setTimeout> | null = null

  const diffVisible = createMemo(() => true)
  const topPermission = createMemo(() => agent.pendingPermissions()[0] ?? null)
  const topQuestion = createMemo(() => agent.pendingQuestions()[0] ?? null)
  const modelLabel = createMemo(() => {
    const m = agent.selectedModel()
    if (!m) return undefined
    return `${m.providerID}/${m.modelID}`
  })

  const contextWindowLabel = createMemo(() => {
    const model = agent.selectedModelInfo?.()
    const max = model?.contextWindow
    if (!max || !Number.isFinite(max)) return undefined

    const msgs = agent.messages()
    for (let i = msgs.length - 1; i >= 0; i--) {
      const parts = msgs[i].parts
      for (let j = parts.length - 1; j >= 0; j--) {
        const p = parts[j]
        if (p.type === "step-finish" && p.tokens?.input && p.tokens.input > 0) {
          const used = p.tokens.input
          const left = Math.max(max - used, 0)
          return `ctx ${left}/${max}`
        }
      }
    }

    return `ctx ?/${max}`
  })
  const contextCount = createMemo(() => contextFiles().size)

  onMount(() => {
    fetchDiff()
  })

  onCleanup(() => {
    if (leaderTimer) clearTimeout(leaderTimer)
  })

  createEffect(() => {
    diffSource()
    fetchDiff()
  })

  createEffect(() => {
    const files = allDiffs()
    const selected = contextFiles()
    const inContext = files.filter((f) => selected.has(f.newPath))
    if (inContext.length > 0) {
      updateDiffContext(inContext, diffSource().type)
    } else {
      clearDiffContext()
    }
  })

  const toggleFileContext = (path: string) => {
    setContextFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const addAllToContext = () => {
    setContextFiles(new Set(allDiffs().map((f) => f.newPath)))
  }

  const clearContext = () => {
    setContextFiles(new Set<string>())
  }

  const handleSlashCommand = (command: string) => {
    const normalized = command.trim().toLowerCase()
    if (normalized === "sessions") {
      agent.refreshSessions()
      setLayoutMode("all")
      setShowSessions(true)
      return
    }
    if (normalized === "expand") {
      setLayoutMode("code")
      setPaneWidths({ files: 45, chat: 0, diff: 55 })
      if (focusedPane() === "chat") setFocusedPane("files")
      return
    }
    if (normalized === "collapse") {
      setLayoutMode("all")
      setPaneWidths((prev) => ({
        files: prev.files > 0 ? prev.files : 18,
        chat: 57,
        diff: prev.diff > 0 ? prev.diff : 25,
      }))
      return
    }
    agent.runCommand(command)
  }

  const armLeader = () => {
    setLeaderArmed(true)
    setSuppressInputUntil(Date.now() + leader.timeoutMs)
    if (leaderTimer) clearTimeout(leaderTimer)
    leaderTimer = setTimeout(() => setLeaderArmed(false), leader.timeoutMs)
  }

  const disarmLeader = () => {
    setLeaderArmed(false)
    if (leaderTimer) {
      clearTimeout(leaderTimer)
      leaderTimer = null
    }
  }

  const runLeaderAction = (name: string): boolean => {
    const keyIs = (...aliases: string[]) => aliases.includes(name)
    if (keyIs("s")) {
      agent.refreshSessions()
      setLayoutMode("all")
      setShowSessions(true)
      return true
    }
    if (keyIs("m")) {
      setShowModelSelector(true)
      return true
    }
    if (keyIs("l")) {
      setShowLogin(true)
      return true
    }
    if (keyIs("r")) {
      fetchDiff()
      return true
    }
    if (keyIs("k")) {
      agent.compact()
      return true
    }
    if (keyIs("t")) {
      setShowThinking((v) => !v)
      return true
    }
    if (keyIs("y")) {
      setShowToolDetails((v) => !v)
      return true
    }
    if (keyIs("n")) {
      agent.createSession()
      setLayoutMode("all")
      return true
    }
    if (keyIs(".", "dot", "period")) {
      cycleFocus()
      return true
    }
    if (keyIs(",", "comma")) {
      cycleFocus(-1)
      return true
    }
    if (keyIs("h", "left")) {
      cycleFocus(-1)
      return true
    }
    if (keyIs("l", "right")) {
      cycleFocus(1)
      return true
    }
    if (keyIs("enter", "e")) {
      toggleExpand()
      return true
    }
    if (keyIs("[", "openbracket", "leftbracket", "lbracket")) {
      resizeFocusedPane(-5)
      return true
    }
    if (keyIs("]", "closebracket", "rightbracket", "rbracket")) {
      resizeFocusedPane(5)
      return true
    }
    return false
  }

  const cycleFocus = (delta = 1) => {
    if (topPermission()) return

    const panes: Pane[] = diffVisible() ? ["files", "chat", "diff"] : ["files", "chat"]
    const idx = panes.indexOf(focusedPane())
    const next = (idx + delta + panes.length) % panes.length
    setFocusedPane(panes[next])
  }

  const toggleExpand = () => {
    setLayoutMode((prev) => {
      if (prev === "all") {
        setPaneWidths({ files: 45, chat: 0, diff: 55 })
        if (focusedPane() === "chat") setFocusedPane("files")
        return "code"
      }
      if (prev === "code") {
        setPaneWidths({ files: 0, chat: 100, diff: 0 })
        setFocusedPane("chat")
        return "chat"
      }
      setPaneWidths({ files: 18, chat: 57, diff: 25 })
      return "all"
    })
  }

  const resizeFocusedPane = (delta: number) => {
    const focused = focusedPane()
    const hasDiff = diffVisible()
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

    if (!hasDiff) {
      setPaneWidths((prev) => {
        let files = prev.files
        let chat = prev.chat
        if (focused === "files") {
          files = clamp(files + delta, 10, 75)
          chat = 100 - files
        } else {
          chat = clamp(chat + delta, 25, 90)
          files = 100 - chat
        }
        return { files, chat, diff: 0 }
      })
      return
    }

    setPaneWidths((prev) => {
      let files = prev.files
      let chat = prev.chat
      let diff = prev.diff

      if (focused === "files") {
        files = clamp(files + delta, 10, 60)
        chat = 100 - files - diff
      } else if (focused === "diff") {
        diff = clamp(diff + delta, 10, 60)
        chat = 100 - files - diff
      } else {
        chat = clamp(chat + delta, 25, 80)
        const side = 100 - chat
        files = clamp(Math.round(side * 0.42), 10, 50)
        diff = 100 - chat - files
      }

      if (chat < 20) {
        const bump = 20 - chat
        if (focused === "files") files = Math.max(10, files - bump)
        else if (focused === "diff") diff = Math.max(10, diff - bump)
        chat = 100 - files - diff
      }

      return { files, chat, diff }
    })
  }

  useKeyboard((key) => {
    const name = getKeyName(key as any)
    const keyIs = (...aliases: string[]) => aliases.includes(name)

    if (showModelSelector() || showSessions() || showLogin()) return

    if (keyMatches(leader.combo, key as any)) {
      armLeader()
      return
    }

    if (leaderArmed()) {
      disarmLeader()
      if (runLeaderAction(name)) return
    }

    if (keyIs("escape", "esc")) {
      disarmLeader()
      if (agent.isStreaming() || topPermission() !== null || topQuestion() !== null) {
        agent.cancel()
      }
      return
    }

    // Fallbacks for terminals with poor modifier support.
    const ctrlTabLike = key.ctrl && keyIs("tab", "i")
    if (ctrlTabLike || (key.ctrl && keyIs(".", "dot", "period"))) {
      cycleFocus()
      return
    }

    if (key.ctrl && keyIs(",", "comma")) {
      cycleFocus(-1)
      return
    }

    if (
      (key.ctrl && keyIs("e", "g")) ||
      (key.ctrl && key.shift && keyIs("f"))
    ) {
      toggleExpand()
      return
    }

    if (
      (key.ctrl && key.shift && keyIs("h", "left")) ||
      (key.ctrl && keyIs("[", ",", "openbracket", "leftbracket", "lbracket"))
    ) {
      resizeFocusedPane(-5)
      return
    }

    if (
      (key.ctrl && key.shift && keyIs("l", "right")) ||
      (key.ctrl && keyIs("]", ".", "closebracket", "rightbracket", "rbracket", "dot", "period"))
    ) {
      resizeFocusedPane(5)
      return
    }

    if (key.ctrl) {
      if (keyIs("x")) agent.cancel()
      return
    }

    const pane = focusedPane()

    if (pane === "files") {
      if (key.shift) {
        switch (name) {
          case "s":
            setDiffSource({ type: "staged" })
            break
          case "a":
            addAllToContext()
            break
          case "c":
            clearContext()
            break
        }
        return
      }

      switch (name) {
        case "j":
        case "down":
          nav.nextFile()
          break
        case "k":
        case "up":
          nav.prevFile()
          break
        case "space":
        case "return": {
          const file = nav.selectedFile()
          if (file) toggleFileContext(file.newPath)
          break
        }
        case "a":
          handleStage()
          break
        case "r":
          handleRevert()
          break
        case "s":
          handleToggleStaged()
          break
        case "w":
          setDiffSource({ type: "working" })
          break
      }
    }

    if (pane === "diff") {
      if (key.shift) {
        switch (name) {
          case "n":
            nav.prevHunk()
            break
        }
        return
      }

      switch (name) {
        case "j":
        case "down":
          nav.nextFile()
          break
        case "k":
        case "up":
          nav.prevFile()
          break
        case "n":
          nav.nextHunk()
          break
        case "u":
          nav.toggleViewMode()
          break
      }
    }
  })

  const handleStage = async () => {
    const file = nav.selectedFile()
    if (!file) return
    try {
      await GitService.stage(file.newPath)
      fetchDiff()
    } catch {}
  }

  const handleRevert = async () => {
    const file = nav.selectedFile()
    if (!file) return
    try {
      await GitService.checkout(file.newPath)
      fetchDiff()
    } catch {}
  }

  const handleToggleStaged = async () => {
    const file = nav.selectedFile()
    if (!file) return
    try {
      if (diffSource().type === "staged") {
        await GitService.unstage(file.newPath)
      } else {
        await GitService.stage(file.newPath)
      }
      fetchDiff()
    } catch {}
  }

  const FilesPane = () => (
    <box flexDirection="column" width="100%" flexGrow={1} overflow="hidden">
      <Show when={loading()}>
        <text fg="#888888"> ...</text>
      </Show>

      <scrollbox flexGrow={1} width="100%">
        <box flexDirection="column" width="100%">
          <Show when={stagedDiffs().length > 0}>
            <box flexDirection="row" width="100%" height={1}>
              <text fg="#888888">Staged:</text>
            </box>
            <For each={stagedDiffs()}>
              {(file, i) => {
                const fileIndex = i()
                const isSelected = createMemo(() => nav.selectedFileIndex() === fileIndex)
                const inContext = createMemo(() => contextFiles().has(file.newPath))
                const statusColor = createMemo(() => {
                  switch (file.status) {
                    case "added": return "#00FF00"
                    case "deleted": return "#FF4444"
                    case "modified": return "#FFFF00"
                    case "renamed": return "#87CEEB"
                  }
                })

                return (
                  <box
                    flexDirection="row"
                    width="100%"
                    bg={isSelected() ? "#333355" : undefined}
                  >
                    <text fg={inContext() ? "#e5c07b" : "#555555"} width={2}>
                      {inContext() ? "C" : " "}
                    </text>
                    <text fg={statusColor()} width={2}>
                      {statusChar(file.status)}
                    </text>
                    <text
                      fg={isSelected() ? "#FFFFFF" : "#cccccc"}
                      flexGrow={1}
                    >
                      {file.newPath}
                    </text>
                  </box>
                )
              }}
            </For>
          </Show>

          <Show when={workingDiffs().length > 0}>
            <box flexDirection="row" width="100%" height={1}>
              <text fg="#888888">Working:</text>
            </box>
            <For each={workingDiffs()}>
              {(file, i) => {
                const fileIndex = stagedDiffs().length + i()
                const isSelected = createMemo(() => nav.selectedFileIndex() === fileIndex)
                const inContext = createMemo(() => contextFiles().has(file.newPath))
                const statusColor = createMemo(() => {
                  switch (file.status) {
                    case "added": return "#00FF00"
                    case "deleted": return "#FF4444"
                    case "modified": return "#FFFF00"
                    case "renamed": return "#87CEEB"
                  }
                })

                return (
                  <box
                    flexDirection="row"
                    width="100%"
                    bg={isSelected() ? "#333355" : undefined}
                  >
                    <text fg={inContext() ? "#e5c07b" : "#555555"} width={2}>
                      {inContext() ? "C" : " "}
                    </text>
                    <text fg={statusColor()} width={2}>
                      {statusChar(file.status)}
                    </text>
                    <text
                      fg={isSelected() ? "#FFFFFF" : "#cccccc"}
                      flexGrow={1}
                    >
                      {file.newPath}
                    </text>
                  </box>
                )
              }}
            </For>
          </Show>

          <Show when={stagedDiffs().length === 0 && workingDiffs().length === 0 && !loading()}>
            <text fg="#555555">No changes</text>
          </Show>
        </box>
      </scrollbox>

      <box height={1} width="100%">
        <text fg="#555555"> {stagedDiffs().length + workingDiffs().length}f  ctx:{contextCount()} </text>
      </box>
    </box>
  )

  const DiffPane = () => (
    <DiffViewer
      file={nav.selectedFile()}
      viewMode={nav.viewMode()}
      selectedHunkIndex={nav.selectedHunkIndex()}
    />
  )

  const ChatPane = () => (
    <box flexDirection="column" width="100%" height="100%" overflow="hidden">
      <Show when={agent.error()}>
        <box width="100%" marginBottom={1}>
          <text fg={theme.color("error")}>error: {agent.error()}</text>
        </box>
      </Show>

      <box flexGrow={1} minHeight={0} width="100%" overflow="hidden">
        <Chat
          messages={agent.messages()}
          isStreaming={agent.isStreaming()}
          showThinking={showThinking()}
          showToolDetails={showToolDetails()}
        />
      </box>

      <PermissionBar
        permission={topPermission()}
        onReply={(id, resp) => agent.replyPermission(id, resp)}
        focused={focusedPane() === "chat" && topPermission() !== null}
      />

      <QuestionBar
        request={topQuestion()}
        onReply={(id, answers) => agent.replyQuestion(id, answers)}
        onReject={(id) => agent.rejectQuestion(id)}
        focused={focusedPane() === "chat" && topQuestion() !== null}
      />

      <MessageInput
        onSend={(content) => agent.sendMessage(content)}
        onCommand={handleSlashCommand}
        onInteract={() => setFocusedPane("chat")}
        disabled={agent.isStreaming() || topPermission() !== null || topQuestion() !== null}
        focused={focusedPane() === "chat" && !leaderArmed()}
        commands={agent.commands() ?? []}
        suppressInputUntil={suppressInputUntil()}
      />
    </box>
  )

  const activeDialog = createMemo(() => {
    if (showModelSelector()) return "model"
    if (showSessions()) return "sessions"
    if (showLogin()) return "login"
    return null
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      <Show
        when={activeDialog() === null}
        fallback={
          <box width="100%" height="100%" bg={theme.color("background")} flexDirection="column">
            <Show when={activeDialog() === "model"}>
              <ModelSelector
                providers={agent.providers() ?? []}
                currentModel={agent.selectedModel()}
                onSelect={(p, m) => agent.selectModel(p, m)}
                onClear={() => agent.clearModel()}
                onClose={() => setShowModelSelector(false)}
              />
            </Show>
            <Show when={activeDialog() === "sessions"}>
              <SessionDialog
                sessions={agent.sessions() ?? []}
                currentSessionId={agent.currentSessionId()}
                onSelect={(id) => {
                  agent.switchSession(id)
                  setLayoutMode("all")
                  setShowSessions(false)
                }}
                onClose={() => setShowSessions(false)}
                onCreate={() => {
                  agent.createSession()
                  setLayoutMode("all")
                  setShowSessions(false)
                }}
              />
            </Show>
            <Show when={activeDialog() === "login"}>
              <LoginDialog
                providers={agent.providers() ?? []}
                onClose={() => setShowLogin(false)}
                onAuthenticated={() => {
                  agent.refreshProviders()
                  setShowLogin(false)
                }}
              />
            </Show>
          </box>
        }
      >
        <box flexGrow={1} width="100%">
          <ThreePane
            files={<FilesPane />}
            chat={<ChatPane />}
            diff={<DiffPane />}
            focusedPane={focusedPane()}
            onFocusPane={setFocusedPane}
            layoutMode={layoutMode()}
            diffVisible={diffVisible()}
            baseWidths={paneWidths()}
          />
        </box>
      </Show>

      <StatusBar
        modelLabel={modelLabel()}
        connected={agent.connected()}
        streaming={agent.isStreaming()}
        leaderLabel={leader.label}
        contextWindowLabel={contextWindowLabel()}
      />
    </box>
  )
}
