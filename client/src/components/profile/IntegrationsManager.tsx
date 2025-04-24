import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, X, Globe, Check, RefreshCw, ExternalLink, AlertTriangle, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Icons for specific providers 
import { SiGoogle, SiNotion, SiTrello, SiSlack, SiEvernote } from "react-icons/si";

interface Integration {
  id: number;
  userId: number;
  provider: string;
  providerName: string;
  status: string;
  connectedAt: string;
  lastSyncedAt?: string;
  scope?: string;
  settings: any;
}

interface IntegrationsManagerProps {
  userId?: number;
}

// Create a custom component for the Mail icon to match structure with SiGoogle, etc.
const OutlookIcon = (props: any) => <Mail {...props} />;

// Available integrations
const AVAILABLE_INTEGRATIONS = [
  { provider: 'google-drive', name: 'Google Drive', icon: SiGoogle, description: 'Sync documents with Google Drive' },
  { provider: 'google-calendar', name: 'Google Calendar', icon: SiGoogle, description: 'Sync events with Google Calendar' },
  { provider: 'notion', name: 'Notion', icon: SiNotion, description: 'Connect with your Notion workspace' },
  { provider: 'trello', name: 'Trello', icon: SiTrello, description: 'Sync tasks with Trello boards' },
  { provider: 'outlook', name: 'Outlook', icon: OutlookIcon, description: 'Sync email and calendar with Outlook' },
  { provider: 'slack', name: 'Slack', icon: SiSlack, description: 'Connect your Slack workspace' },
  { provider: 'evernote', name: 'Evernote', icon: SiEvernote, description: 'Sync notes with Evernote' }
];

const IntegrationsManager: React.FC<IntegrationsManagerProps> = ({ userId }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedIntegration, setSelectedIntegration] = useState<typeof AVAILABLE_INTEGRATIONS[0] | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Mock data for connection details since we're not implementing the actual OAuth flow
  const [connectionDetails, setConnectionDetails] = useState({
    accessToken: '',
    refreshToken: '',
    expiresIn: '3600',
  });

  // Fetch user integrations
  const { data: integrations, isLoading, error } = useQuery({
    queryKey: ['/api/users', userId, 'integrations'],
    queryFn: async () => {
      if (!userId) return { integrations: [] };
      return apiRequest<{ integrations: Integration[] }>(`/api/users/${userId}/integrations`);
    },
    enabled: !!userId,
  });

  // Add integration mutation
  const addIntegrationMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/integrations', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'integrations'] });
      setIsAddModalOpen(false);
      toast({
        title: 'Integration Added',
        description: `Successfully connected to ${selectedIntegration?.name}`,
        variant: 'default',
        className: 'bg-background/80 border border-primary text-foreground',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to add integration. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to add integration:', error);
    },
  });

  // Remove integration mutation
  const removeIntegrationMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      return apiRequest(`/api/integrations/${integrationId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'integrations'] });
      toast({
        title: 'Integration Removed',
        description: 'Successfully disconnected integration',
        variant: 'default',
        className: 'bg-background/80 border border-primary text-foreground',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to remove integration. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to remove integration:', error);
    },
  });

  const handleAddIntegration = (provider: typeof AVAILABLE_INTEGRATIONS[0]) => {
    setSelectedIntegration(provider);
    setIsAddModalOpen(true);
  };

  const handleConnectService = () => {
    if (!selectedIntegration || !userId) return;
    
    // In a real application, we would initiate OAuth flow here
    // For now, we'll simulate API connection by directly calling our endpoint
    addIntegrationMutation.mutate({
      userId,
      provider: selectedIntegration.provider,
      providerName: selectedIntegration.name,
      accessToken: connectionDetails.accessToken,
      refreshToken: connectionDetails.refreshToken,
      tokenExpiry: new Date(Date.now() + parseInt(connectionDetails.expiresIn) * 1000).toISOString(),
      scope: 'read,write',
      status: 'active',
      settings: {}
    });
  };

  const handleRemoveIntegration = (integrationId: number) => {
    if (confirm('Are you sure you want to disconnect this integration?')) {
      removeIntegrationMutation.mutate(integrationId);
    }
  };

  const getIntegrationIcon = (provider: string) => {
    const integration = AVAILABLE_INTEGRATIONS.find(
      int => int.provider === provider || int.provider.includes(provider) || provider.includes(int.provider)
    );
    
    if (integration) {
      const IconComponent = integration.icon;
      return <IconComponent className="h-4 w-4 text-primary mr-2" />;
    }
    
    return <Globe className="h-4 w-4 text-primary mr-2" />;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 text-red-500 space-x-2">
        <AlertTriangle className="h-5 w-5" />
        <p className="text-sm">Failed to load integrations</p>
      </div>
    );
  }

  const connectedIntegrations = integrations?.integrations || [];
  const availableToConnect = AVAILABLE_INTEGRATIONS.filter(
    integration => !connectedIntegrations.some(conn => conn.provider === integration.provider)
  );

  return (
    <div className="space-y-4">
      {/* Connected integrations */}
      {connectedIntegrations.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Connected Services</h3>
          <div className="space-y-2">
            {connectedIntegrations.map((integration) => (
              <div 
                key={integration.id}
                className="flex justify-between items-center p-3 bg-card/50 rounded-lg border border-primary/10"
              >
                <div className="flex items-center">
                  {getIntegrationIcon(integration.provider)}
                  <div>
                    <p className="text-sm font-medium">{integration.providerName}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20 text-primary">
                        {integration.status}
                      </Badge>
                      {integration.lastSyncedAt && (
                        <span className="text-xs text-muted-foreground">
                          Last synced: {new Date(integration.lastSyncedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Sync now"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    title="Disconnect"
                    onClick={() => handleRemoveIntegration(integration.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available integrations */}
      <div>
        <h3 className="text-sm font-medium mb-2">Available Services</h3>
        <div className="space-y-2">
          {availableToConnect.map((integration) => (
            <Button 
              key={integration.provider}
              variant="outline"
              className="w-full flex justify-between items-center bg-background/50 border-primary/30 hover:bg-primary/10 transition-colors"
              size="sm"
              onClick={() => handleAddIntegration(integration)}
            >
              <div className="flex items-center">
                <integration.icon className="h-4 w-4 mr-2 text-primary" />
                <span>{integration.name}</span>
              </div>
              <Plus className="h-4 w-4" />
            </Button>
          ))}
        </div>
      </div>

      {availableToConnect.length === 0 && (
        <p className="text-xs text-muted-foreground text-center italic">
          All available integrations are connected.
        </p>
      )}

      {/* Add Integration Dialog */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {selectedIntegration && (
                <>
                  <selectedIntegration.icon className="h-5 w-5 mr-2 text-primary" />
                  Connect to {selectedIntegration.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedIntegration?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="access-token">Access Token</Label>
              <Input 
                id="access-token" 
                placeholder="Enter access token" 
                value={connectionDetails.accessToken}
                onChange={(e) => setConnectionDetails({...connectionDetails, accessToken: e.target.value})}
              />
              <p className="text-xs text-muted-foreground">
                This would be provided by the service after OAuth authentication.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refresh-token">Refresh Token</Label>
              <Input 
                id="refresh-token" 
                placeholder="Enter refresh token" 
                value={connectionDetails.refreshToken}
                onChange={(e) => setConnectionDetails({...connectionDetails, refreshToken: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expires-in">Expires In (seconds)</Label>
              <Input 
                id="expires-in" 
                type="number"
                placeholder="3600" 
                value={connectionDetails.expiresIn}
                onChange={(e) => setConnectionDetails({...connectionDetails, expiresIn: e.target.value})}
              />
            </div>

            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 text-xs">
              <div className="flex items-start">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-2 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-300">Demo Mode</p>
                  <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                    In a production environment, users would be redirected to authenticate with the provider directly using OAuth.
                    This form simulates token acquisition for demonstration purposes.
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-yellow-800 dark:text-yellow-300 p-0 h-auto mt-1"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Learn about OAuth
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleConnectService}
              disabled={!connectionDetails.accessToken || addIntegrationMutation.isPending}
              className="bg-primary text-background hover:bg-primary/90"
            >
              {addIntegrationMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntegrationsManager;