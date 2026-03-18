import { useState, useEffect, useCallback } from 'react';
import {
  Page, Card, IndexTable, Text, Badge, Button, Modal,
  DropZone, BlockStack, InlineStack, Banner, EmptyState,
  SkeletonBodyText, Spinner, Box,
} from '@shopify/polaris';
import { TitleBar, useAppBridge } from '@shopify/app-bridge-react';
import { DeleteIcon } from '@shopify/polaris-icons';
import { knowledgeBaseApi, type KnowledgeDocument } from '../api/knowledge-base';

export default function KnowledgeBase() {
  const shopify = useAppBridge();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [files, setFiles]         = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  useEffect(() => {
    knowledgeBaseApi.getAll()
      .then(setDocuments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDrop = useCallback((_: File[], accepted: File[]) => {
    setFiles(accepted);
    setUploadError('');
  }, []);

  const handleUpload = useCallback(async () => {
    if (!files.length) return;
    setUploading(true); setUploadError('');
    try {
      const doc = await knowledgeBaseApi.uploadFile(files[0]);
      setDocuments(prev => [doc, ...prev]);
      setUploadModalOpen(false);
      setFiles([]);
      shopify.toast.show('File uploaded ✓');
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally { setUploading(false); }
  }, [files, shopify]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await knowledgeBaseApi.delete(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      setDeleteId(null);
      shopify.toast.show('Document removed');
    } catch (err: any) {
      shopify.toast.show(err.message || 'Delete failed', { isError: true });
    }
  }, [shopify]);

  const statusBadge = (status: KnowledgeDocument['status']) => {
    const map = { ready: 'success', processing: 'attention', error: 'critical' } as const;
    return <Badge tone={map[status]}>{status}</Badge>;
  };

  if (loading) return <Page title="Knowledge Base"><Card><SkeletonBodyText lines={6} /></Card></Page>;

  return (
    <Page
      title="Knowledge Base"
      subtitle="Upload documents — the AI uses them to answer customer questions"
      primaryAction={{ content: 'Upload Document', onAction: () => setUploadModalOpen(true) }}>
      <TitleBar title="Knowledge Base">
        <button variant="primary" onClick={() => setUploadModalOpen(true)}>Upload Document</button>
      </TitleBar>
      <BlockStack gap="400">
        <Banner tone="info">
          Upload an Excel file (.xlsx) with "Question" and "Answer" columns to teach your smartSearch about store policies, FAQs, and more.
          Each row should have a question and its answer. The smartSearch will use this to respond to customer queries.
        </Banner>

        {documents.length === 0 ? (
          <Card>
            <EmptyState
              heading="No documents yet"
              image=""
              action={{ content: 'Upload Document', onAction: () => setUploadModalOpen(true) }}>
              <p>Upload an Excel file with Q&A pairs to teach your smartSearch about your store.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              itemCount={documents.length}
              headings={[{ title: 'File' }, { title: 'URL' }, { title: 'Status' }, { title: 'Uploaded' }, { title: '' }]}
              selectable={false}>
              {documents.map((doc, i) => (
                <IndexTable.Row id={doc.id} key={doc.id} position={i}>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">{doc.title}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#2c6ecb' }}>
                          View file
                        </a>
                      ) : '—'}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{statusBadge(doc.status)}</IndexTable.Cell>
                  <IndexTable.Cell>{new Date(doc.uploadedAt).toLocaleDateString()}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button icon={DeleteIcon} variant="plain" tone="critical"
                      onClick={() => setDeleteId(doc.id)}
                      accessibilityLabel={`Delete ${doc.title}`} />
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}
      </BlockStack>

      {/* Upload Modal */}
      <Modal
        open={uploadModalOpen}
        onClose={() => { setUploadModalOpen(false); setFiles([]); setUploadError(''); }}
        title="Upload Document"
        primaryAction={{
          content: 'Upload',
          onAction: handleUpload,
          loading: uploading,
          disabled: !files.length,
        }}
        secondaryActions={[{
          content: 'Cancel',
          onAction: () => { setUploadModalOpen(false); setFiles([]); },
        }]}>
        <Modal.Section>
          <BlockStack gap="300">
            {uploadError && <Banner tone="critical" onDismiss={() => setUploadError('')}>{uploadError}</Banner>}
            {uploading ? (
              <Box padding="600">
                <InlineStack align="center" gap="300">
                  <Spinner size="small" />
                  <Text as="p" variant="bodySm">Uploading…</Text>
                </InlineStack>
              </Box>
            ) : (
              <DropZone onDrop={handleDrop} accept=".xlsx,.xls" allowMultiple={false}>
                {files.length > 0 ? (
                  <Box padding="400">
                    <InlineStack align="center">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">{files[0].name}</Text>
                    </InlineStack>
                  </Box>
                ) : (
                  <DropZone.FileUpload actionHint="Accepts Excel files (.xlsx) with Question & Answer columns (max 10MB)" />
                )}
              </DropZone>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirm */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Document?"
        primaryAction={{
          content: 'Delete',
          onAction: () => deleteId && handleDelete(deleteId),
          destructive: true,
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setDeleteId(null) }]}>
        <Modal.Section>
          <Text as="p">This document will be removed from the knowledge base.</Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
