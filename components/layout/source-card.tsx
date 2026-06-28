'use client'

import { Heart, ExternalLink } from 'lucide-react'

interface SourceCardProps {
  id: string
  title: string
  author: string
  url: string
  likes: number
  excerpt: string
}

export function SourceCard({ title, author, url, likes, excerpt }: SourceCardProps) {
  const likesDisplay = likes >= 1000 ? `${(likes / 1000).toFixed(1)}k` : String(likes)

  return (
    <div className="rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-sm">
      <h4 className="text-sm font-medium leading-snug line-clamp-2">{title}</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        @{author}
        {likes > 0 && (
          <span className="inline-flex items-center gap-0.5 ml-2">
            <Heart className="h-3 w-3" />
            {likesDisplay}
          </span>
        )}
      </p>
      {excerpt && (
        <p className="mt-1.5 text-xs text-muted-foreground/80 line-clamp-3 leading-relaxed">
          {excerpt}
        </p>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        查看原文
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
