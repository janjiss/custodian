import type { DiffRenderableOptions, DiffRenderable } from "@opentui/core"
import type { Ref } from "solid-js"

declare module "@opentui/solid" {
  // Already registered in the component catalogue, just needs JSX types
}

declare namespace JSX {
  interface IntrinsicElements {
    diff: DiffRenderableOptions & {
      ref?: Ref<DiffRenderable>
      style?: Partial<DiffRenderableOptions>
    }
  }
}
