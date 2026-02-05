export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Code Topology</h1>
        <p className="text-gray-600">
          Run <code className="bg-gray-100 px-2 py-1 rounded">topology analyze</code> to generate graph data
        </p>
      </div>
    </main>
  );
}
