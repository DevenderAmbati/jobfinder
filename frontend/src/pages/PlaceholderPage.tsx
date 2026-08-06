import { PageHeader } from '../components/PageHeader';

interface PlaceholderPageProps {
  title: string;
  phase: string;
  description: string;
}

export function PlaceholderPage({
  title,
  phase,
  description,
}: PlaceholderPageProps) {
  return (
    <section className="page">
      <PageHeader eyebrow={phase} title={title} description={description} />
      <p className="banner">
        No page matches this path. Use the sidebar to navigate.
      </p>
    </section>
  );
}
