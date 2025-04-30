import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setGeneratedUrl(null);
    setIsLoading(true);

    try {
      // Always use a relative URL for the API call
      const response = await fetch('/api/generate-recipe', {
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

      // Use absolute URL for Recipe Keeper compatibility
      const absUrl =
        typeof window !== 'undefined'
          ? window.location.origin + data.url
          : data.url;
      setGeneratedUrl(absUrl);
      setUrl(''); // Clear the input
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>Mindful Chef → Recipe Keeper Converter</h1>
      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste Mindful Chef Recipe URL"
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '4px',
            border: '1px solid #ccc',
          }}
          disabled={isLoading}
        />
        <button
          type="submit"
          style={{
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'wait' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
          }}
          disabled={isLoading}
        >
          {isLoading ? 'Generating...' : 'Generate Recipe URL'}
        </button>
      </form>

      {error && (
        <div
          style={{
            color: '#dc3545',
            padding: '15px',
            marginBottom: '20px',
            backgroundColor: '#f8d7da',
            borderRadius: '4px',
          }}
        >
          Error: {error}
        </div>
      )}

      {generatedUrl && (
        <div
          style={{
            padding: '15px',
            marginBottom: '20px',
            backgroundColor: '#d4edda',
            borderRadius: '4px',
            color: '#155724',
          }}
        >
          <p>✅ Recipe URL generated! Copy this URL into Recipe Keeper:</p>
          <input
            type="text"
            value={generatedUrl}
            readOnly
            onClick={(e) => e.target.select()}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '10px',
              border: '1px solid #28a745',
              borderRadius: '4px',
            }}
          />
        </div>
      )}
    </div>
  );
} 