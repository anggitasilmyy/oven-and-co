// pages/dev/OverlayShowcase.jsx
// Step 2.5 (PR A) · Contoh Modal & BottomSheet responsif di /dev/design

import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import BottomSheet from '../../components/ui/BottomSheet';

export default function OverlayShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="card p-4 flex flex-wrap gap-3">
      <Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>Buka Modal</Button>
      <Button size="sm" variant="secondary" onClick={() => setSheetOpen(true)}>Buka BottomSheet</Button>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Ubah status pesanan?"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button size="sm" onClick={() => setModalOpen(false)}>Simpan</Button>
          </>
        }
      >
        Modal tampil di tengah layar (tidak lagi tergeser ke kiri) dengan lebar responsif.
      </Modal>

      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter & Urutan"
        footer={<Button size="sm" onClick={() => setSheetOpen(false)}>Terapkan</Button>}
      >
        <p className="text-sm text-cocoa/70">&lt; 768 px: muncul dari bawah · ≥ 768 px: dialog di tengah.</p>
      </BottomSheet>
    </div>
  );
}
