import { useState, useEffect } from 'react';
import {
  Page, Card, IndexTable, Text, Badge, BlockStack, Banner,
  SkeletonBodyText, EmptyState,
} from '@shopify/polaris';
import { TitleBar } from '@shopify/app-bridge-react';
import { usersApi, type GuestUser } from '../api/users';

export default function GuestUsers() {
  const [guests, setGuests]   = useState<GuestUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    usersApi.getGuests()
      .then(setGuests)
      .catch(err => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Page title="Guest Users"><Card><SkeletonBodyText lines={6} /></Card></Page>;

  return (
    <Page title="Guest Users" subtitle="Visitors who chatted without a Shopify account">
      <TitleBar title="Guest Users" />
      <BlockStack gap="400">
        {error && <Banner tone="critical" onDismiss={() => setError('')}>{error}</Banner>}
        <Banner tone="info">
          Guest users are visitors who chatted without logging in. They may have provided a name or email.
        </Banner>

        {guests.length === 0 ? (
          <Card>
            <EmptyState heading="No guest users yet" image="">
              <p>Guest users will appear here after they interact with the smartSearch.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              itemCount={guests.length}
              headings={[
                { title: 'Name / Email' },
                { title: 'Messages' },
                { title: 'First Chat' },
                { title: 'Last Chat' },
                { title: 'Type' },
              ]}
              selectable={false}>
              {guests.map((g, i) => (
                <IndexTable.Row id={g.id} key={g.id} position={i}>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {g.guestName || g.guestEmail || 'Anonymous'}
                    </Text>
                    {g.guestEmail && g.guestName && (
                      <Text as="p" variant="bodySm" tone="subdued">{g.guestEmail}</Text>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{g.messageCount}</IndexTable.Cell>
                  <IndexTable.Cell>{new Date(g.startedAt).toLocaleDateString()}</IndexTable.Cell>
                  <IndexTable.Cell>{new Date(g.lastMessageAt).toLocaleDateString()}</IndexTable.Cell>
                  <IndexTable.Cell><Badge>Guest</Badge></IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
