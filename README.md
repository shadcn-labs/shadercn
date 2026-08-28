<p align="center">
  <img src="https://shadercn.vercel.app/og.png" alt="shadercn banner" />
</p>

<h1 align="center">shadercn</h1>

<p align="center">
  Free & open-source, GPU-powered shader components for React.<br/>
  Copy, paste, and ship. Built on <a href="https://vgpu.labs.vercel.dev/">vgpu</a>, works seamlessly with <a href="https://ui.shadcn.com/">shadcn/ui</a>.
</p>

<p align="center">
  <a href="https://github.com/shadcn-labs/shadercn"><img src="https://www.shieldcn.dev/github/stars/shadcn-labs/shadercn.svg?variant=secondary&size=xs&theme=zinc" alt="GitHub Stars" /></a>
  <a href="https://github.com/shadcn-labs/shadercn/actions"><img src="https://www.shieldcn.dev/github/ci/shadcn-labs/shadercn.svg?variant=secondary&size=xs&theme=zinc" alt="CI" /></a>
  <a href="https://discord.gg/N6G36KhYK4"><img src="https://www.shieldcn.dev/discord/online-members/N6G36KhYK4.svg?variant=secondary&size=xs&theme=zinc" alt="Discord Members" /></a>
  <a href="https://x.com/shadcnlabs"><img src="https://www.shieldcn.dev/x/follow/shadcnlabs.svg?variant=branded&size=xs&theme=zinc" alt="X Follow" /></a>
</p>

<p align="center">
  <a href="https://shadercn.vercel.app/docs">Get Started</a> ·
  <a href="https://shadercn.vercel.app/docs/installation">Installation</a> ·
  <a href="https://shadercn.vercel.app/docs/components">Components</a>
</p>

## Features

- ⚡ **GPU-powered** — Fragment shaders running on the GPU via WebGPU
- 🎯 **Zero config** — Works out of the box with sensible defaults
- 👀 **Live previews** — Render every shader component directly in the documentation
- 🎨 **Fully customizable** — Pass props to control uniforms, colors, speed, and more
- 📦 **shadcn/ui compatible** — Uses the same registry format and CLI workflow
- 🧩 **Composable** — Build effects from focused React components

## Built On

- [vgpu](https://vgpu.labs.vercel.dev/) — Modular cross-runtime WebGPU library
- [shadcn/ui](https://ui.shadcn.com/) — Component registry and CLI
- [Next.js 16](https://nextjs.org/) — App Router
- [React 19](https://react.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)

## Quick Start

1. **Install a component**:

```bash
npx shadcn@latest add https://shadercn.vercel.app/r/component-name.json
```

2. **Use it in your app**:

```tsx
import { ShaderComponent } from "@/components/ui/shader-component";

export function Hero() {
  return <ShaderComponent />;
}
```

## Project Structure

```
├── registry/             # Shader components
│   └── new-york/
├── registry.json         # Registry manifest
├── content/docs/         # Documentation (MDX)
├── app/                  # Next.js app
└── public/r/             # Built registry files (auto-generated)
```

## Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm registry:build` - Rebuild the component registry

## Community

The shadercn community lives on [GitHub](https://github.com/shadcn-labs/shadercn), where you can ask questions, share ideas, and show what you've built.

## Contributing

Contributions are welcome. By participating, you agree to the Code of Conduct.

## License

[MIT](./LICENSE)
