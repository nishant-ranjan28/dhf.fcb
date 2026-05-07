import { NewPostForm } from "./NewPostForm";

export default function NewPostPage() {
  return (
    <div className="px-4 mt-4">
      <h1 className="text-lg font-bold text-white">New post</h1>
      <p className="text-[12px] text-ink-muted mt-1">
        Markdown body. Paste image URLs as <code>![alt](url)</code>, paste a YouTube URL on its own line for auto-embed, or paste any iframe / oEmbed HTML directly.
      </p>
      <NewPostForm />
    </div>
  );
}
