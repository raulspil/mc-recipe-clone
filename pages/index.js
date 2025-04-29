import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [staticUrl, setStaticUrl] = useState(null);

  const handleSubmit = async (e, endpoint) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setStaticUrl(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/${endpoint}`, {
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

      if (endpoint === 'generate-static') {
        setStaticUrl(data.url);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>Mindful Chef → Recipe Keeper Converter</h1>
      <form style={{ marginBottom: '20px' }}>
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
            border: '1px solid #ccc'
          }}
          disabled={isLoading}
        />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={(e) => handleSubmit(e, 'convert')}
            style={{ 
              padding: '12px 24px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'wait' : 'pointer',
              opacity: isLoading ? 0.7 : 1
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Converting...' : 'Convert'}
          </button>
          <button 
            onClick={(e) => handleSubmit(e, 'generate-static')}
            style={{ 
              padding: '12px 24px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'wait' : 'pointer',
              opacity: isLoading ? 0.7 : 1
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Generating...' : 'Generate Static URL'}
          </button>
        </div>
      </form>

      {error && (
        <div style={{ 
          color: '#dc3545',
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: '#f8d7da',
          borderRadius: '4px'
        }}>
          Error: {error}
        </div>
      )}

      {staticUrl && (
        <div style={{
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: '#d4edda',
          borderRadius: '4px',
          color: '#155724'
        }}>
          <p>✅ Static URL generated! Copy this URL into Recipe Keeper:</p>
          <input
            type="text"
            value={staticUrl}
            readOnly
            onClick={(e) => e.target.select()}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '10px',
              border: '1px solid #28a745',
              borderRadius: '4px'
            }}
          />
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