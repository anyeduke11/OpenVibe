import { zh } from '../i18n/zh'

export function PlaceholderPage(props: { title: string; task: string }) {
  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold">{props.title}</h1>
      <p className="mt-2 text-sm text-zinc-500">
        {zh.comingSoon}
        <span className="mono ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{props.task}</span>
      </p>
    </div>
  )
}
