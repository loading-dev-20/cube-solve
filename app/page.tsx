import CubeSolver from "@/components/CubeSolver";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <CubeSolver />
    </main>
  );
}
