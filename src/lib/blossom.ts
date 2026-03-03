// TestBlossom.tsx
import { useEffect, useState } from 'react';
import { testBlossomUpload, uploadToBlossom, getBlossomServers } from '@/lib/blossom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostr } from '@nostrify/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function TestBlossom() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'testing' | 'uploading'>('idle');
  const [servers, setServers] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 20));
  };

  const runTests = async () => {
    setStatus('testing');
    addLog('🧪 Starting blossom tests...');
    
    // Test server connectivity
    addLog('Testing server connectivity...');
    const testServers = [
      'https://blossom.primal.net',
      'https://blossom.band',
      'https://nostr.media',
    ];
    
    for (const server of testServers) {
      try {
        const response = await fetch(server, { method: 'HEAD', mode: 'cors' });
        addLog(`✅ ${server}: ${response.status} ${response.statusText}`);
      } catch (error) {
        addLog(`❌ ${server}: Failed - ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
    
    // Get blossom servers
    if (nostr && user?.pubkey) {
      try {
        addLog('Fetching blossom servers from Nostr...');
        const servers = await getBlossomServers(nostr, user.pubkey);
        setServers(servers);
        addLog(`Found ${servers.length} servers: ${servers.join(', ')}`);
      } catch (error) {
        addLog(`❌ Failed to fetch servers: ${error}`);
      }
    }
    
    setStatus('idle');
  };

  const testUpload = async () => {
    if (!user?.pubkey || !user.signer) {
      addLog('❌ User not logged in or no signer');
      return;
    }
    
    setStatus('uploading');
    addLog('📤 Testing upload...');
    
    // Create a tiny test blob
    const testBlob = new Blob(['test audio data for blossom upload'], { 
      type: 'audio/webm' 
    });
    addLog(`Test blob created: ${testBlob.size} bytes, type: ${testBlob.type}`);
    
    try {
      const url = await uploadToBlossom(
        testBlob,
        servers.length ? servers : undefined,
        user.pubkey,
        user.signer
      );
      addLog(`✅ Upload successful! URL: ${url}`);
    } catch (error) {
      addLog(`❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    setStatus('idle');
  };

  return (
    <Card className="p-6 max-w-3xl mx-auto my-8">
      <h2 className="text-2xl font-bold mb-4">🧪 Blossom Test Panel</h2>
      
      <div className="space-y-4 mb-6">
        <div className="flex gap-4">
          <Button 
            onClick={runTests} 
            disabled={status !== 'idle'}
            variant="outline"
          >
            {status === 'testing' ? 'Testing...' : '1. Test Connectivity'}
          </Button>
          
          <Button 
            onClick={testUpload} 
            disabled={status !== 'idle' || !user?.pubkey}
            variant="default"
          >
            {status === 'uploading' ? 'Uploading...' : '2. Test Upload'}
          </Button>
        </div>
        
        {!user?.pubkey && (
          <p className="text-yellow-600 text-sm">
            ⚠️ Please login to test upload
          </p>
        )}
      </div>
      
      <div className="bg-black text-green-400 p-4 rounded-md font-mono text-sm h-80 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-gray-500">No logs yet. Run tests to see output.</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {log}
            </div>
          ))
        )}
      </div>
      
      {servers.length > 0 && (
        <div className="mt-4 p-3 bg-gray-100 rounded">
          <p className="font-medium">Detected servers:</p>
          <ul className="list-disc list-inside text-sm">
            {servers.map(s => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}