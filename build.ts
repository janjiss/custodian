import solidPlugin from "@opentui/solid/bun-plugin"

const mode = process.argv[2] ?? "dev"

if (mode === "compile") {
  const platform = process.argv[3] ?? `bun-${process.platform}-${process.arch}`

  const result = await Bun.build({
    entrypoints: ["./src/index.tsx"],
    plugins: [solidPlugin],
    compile: {
      target: platform as "bun",
      outfile: "./dist/custodian",
    },
  })

  if (!result.success) {
    console.error("Compile failed:")
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  console.log("Compiled standalone binary: dist/custodian")
} else {
  const result = await Bun.build({
    entrypoints: ["./src/index.tsx"],
    target: "bun",
    outdir: "./dist",
    plugins: [solidPlugin],
  })

  if (!result.success) {
    console.error("Build failed:")
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  console.log("Build succeeded:", result.outputs.map((o) => o.path))
}
