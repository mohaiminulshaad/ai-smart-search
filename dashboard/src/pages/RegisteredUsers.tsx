import { useState, useEffect, useCallback } from 'react';
import {
  Page, Card, IndexTable, Text, Badge, BlockStack, Banner,
  SkeletonBodyText, EmptyState, Modal, Box, Spinner, InlineStack,
} from '@shopify/polaris';
import { TitleBar } from '@shopify/app-bridge-react';
import { usersApi, type RegisteredUser, type SessionMessage } from '../api/users';

export default function RegisteredUsers() {
  const [users, setUsers]           = useState<RegisteredUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [selectedUser, setSelectedUser] = useState<RegisteredUser | null>(null);
  const [messages, setMessages]     = useState<SessionMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    usersApi.getRegistered()
      .then(setUsers)
      .catch(err => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const handleRowClick = useCallback((user: RegisteredUser) => {
    setSelectedUser(user);
    setLoadingMessages(true);
    usersApi.getMessages(user.id)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }, []);

  if (loading) return <Page title="Registered Users"><Card><SkeletonBodyText lines={6} /></Card></Page>;

  return (
    <Page title="Registered Users" subtitle="Logged-in Shopify customers who used the smartSearch">
      <TitleBar title="Registered Users" />
      <BlockStack gap="400">
        {error && <Banner tone="critical" onDismiss={() => setError('')}>{error}</Banner>}
        <Banner tone="info">
          Registered users are logged-in Shopify customers. They can upload images and have persistent chat history.
        </Banner>

        {users.length === 0 ? (
          <Card>
            <EmptyState heading="No registered users yet" image="">
              <p>Registered Shopify customers will appear here after using the smartSearch.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              itemCount={users.length}
              headings={[
                { title: 'Name / Email' },
                { title: 'Customer ID' },
                { title: 'Messages' },
                { title: 'Last Chat' },
                { title: 'Type' },
              ]}
              selectable={false}>
              {users.map((user, i) => (
                <IndexTable.Row
                  id={user.id}
                  key={user.id}
                  position={i}
                  onClick={() => handleRowClick(user)}>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {user.guestName || user.customerId || 'Customer'}
                    </Text>
                    {user.guestEmail && (
                      <Text as="p" variant="bodySm" tone="subdued">{user.guestEmail}</Text>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" tone="subdued">{user.customerId || '—'}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{user.messageCount}</IndexTable.Cell>
                  <IndexTable.Cell>{new Date(user.lastMessageAt).toLocaleDateString()}</IndexTable.Cell>
                  <IndexTable.Cell><Badge tone="success">Registered</Badge></IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>

      {/* Chat History Modal */}
      <Modal
        open={!!selectedUser}
        onClose={() => { setSelectedUser(null); setMessages([]); }}
        title={`Chat History — ${selectedUser?.guestName || selectedUser?.customerId || 'Customer'}`}
        secondaryActions={[{ content: 'Close', onAction: () => { setSelectedUser(null); setMessages([]); } }]}>
        <Modal.Section>
          {loadingMessages ? (
            <InlineStack align="center"><Spinner size="small" /></InlineStack>
          ) : messages.length === 0 ? (
            <Text as="p" tone="subdued">No messages found.</Text>
          ) : (
            <BlockStack gap="200">
              {messages.map((msg, i) => (
                <Box key={i} padding="200" background={msg.role === 'user' ? 'bg-surface-secondary' : 'bg-surface'} borderRadius="200">
                  <Text as="p" variant="bodySm" tone={msg.role === 'user' ? 'subdued' : undefined}>
                    <strong>{msg.role === 'user' ? '👤 User' : '🤖 Bot'}</strong>
                    {' · '}
                    <span style={{ opacity: 0.6 }}>{new Date(msg.createdAt).toLocaleString()}</span>
                  </Text>
                  <Text as="p" variant="bodyMd">{msg.content}</Text>
                </Box>
              ))}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
