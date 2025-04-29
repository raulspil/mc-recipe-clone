import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>Mindful Chef Recipe Converter</h1>
      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter Mindful Chef recipe URL"
          style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
          disabled={isLoading}
        />
        <button 
          type="submit" 
          style={{ padding: '8px 16px' }}
          disabled={isLoading}
        >
          {isLoading ? 'Converting...' : 'Convert Recipe'}
        </button>
      </form>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          Error: {error}
        </div>
      )}

      {result && (
        <div>
          <h2>Result:</h2>
          <div dangerouslySetInnerHTML={{ __html: result.html }} />
        </div>
      )}
    </div>
  );
} 