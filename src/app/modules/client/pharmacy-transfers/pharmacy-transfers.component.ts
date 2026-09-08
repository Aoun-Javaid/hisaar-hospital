import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { AppDialogService } from '../../../core/services/app-dialog.service';
import { BackendService } from '../../../core/services/backend.service';
import { ProductCatalogItem, Store, Transfer, Warehouse } from '../../../shared/models/hospital.model';
import { formatDateTime, readAssignedStoreId } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-transfers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pharmacy-transfers.component.html',
  styleUrl: './pharmacy-transfers.component.scss',
})
export class PharmacyTransfersComponent implements OnInit {
  stores: Store[] = [];
  transfers: Transfer[] = [];
  loading = false;
  actingId = '';
  status = '';
  transferNo = '';
  fromDate = '';
  toDate = '';
  storeId = readAssignedStoreId();
  warehouses: Warehouse[] = [];
  products: ProductCatalogItem[] = [];
  creating = false;
  fromLocationType: 'store' | 'warehouse' = 'warehouse';
  fromLocationId = '';
  toLocationType: 'store' | 'warehouse' = 'store';
  toLocationId = '';
  productId = '';
  qty = 1;
  note = '';

  constructor(
    private backend: BackendService,
    private dialog: AppDialogService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadStores();
    this.loadWarehouses();
    this.loadProducts();
    this.loadTransfers();
  }

  get canCreate(): boolean {
    return this.backend.hasPermission('transfers.create');
  }

  get pendingCount(): number {
    return this.transfers.filter((transfer) => transfer.status === 'pending').length;
  }

  get receivedCount(): number {
    return this.transfers.filter((transfer) => transfer.status === 'received').length;
  }

  get inTransitCount(): number {
    return this.transfers.filter((transfer) => ['approved', 'dispatched'].includes(transfer.status)).length;
  }

  loadStores(): void {
    if (!this.backend.hasPermission('stores.read')) {
      return;
    }

    this.backend.getStores({ limit: 100, isActive: true }).subscribe({
      next: (result) => {
        this.stores = result.items || [];
        if (!this.toLocationId && this.toLocationType === 'store' && this.stores[0]?._id) {
          this.toLocationId = this.stores[0]._id;
        }
      },
      error: () => (this.stores = []),
    });
  }

  loadTransfers(): void {
    this.loading = true;
    this.backend
      .getTransfers({
        limit: 100,
        status: this.status || undefined,
        transferNo: this.transferNo.trim() || undefined,
        fromLocationType: this.storeId ? 'store' : undefined,
        fromLocationId: this.storeId || undefined,
        fromDate: this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : undefined,
        toDate: this.toDate ? new Date(`${this.toDate}T23:59:59`).toISOString() : undefined,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.transfers = result.items),
        error: (err) => {
          this.transfers = [];
          this.toastr.error(err?.error?.message || 'Unable to load stock transfers.');
        },
      });
  }

  reset(): void {
    this.status = '';
    this.transferNo = '';
    this.fromDate = '';
    this.toDate = '';
    this.storeId = readAssignedStoreId();
    this.loadTransfers();
  }

  loadWarehouses(): void {
    if (!this.backend.hasPermission('warehouses.read') && !this.backend.hasPermission('warehouses.manage')) {
      return;
    }
    this.backend.getWarehouses({ limit: 100 }).subscribe({
      next: (result) => {
        this.warehouses = result.items || [];
        if (!this.fromLocationId && this.fromLocationType === 'warehouse' && this.warehouses[0]?._id) {
          this.fromLocationId = this.warehouses[0]._id;
        }
      },
      error: () => (this.warehouses = []),
    });
  }

  loadProducts(): void {
    if (!this.backend.hasPermission('products.read')) {
      return;
    }
    this.backend.getProducts({ limit: 100 }).subscribe({
      next: (result) => {
        this.products = result.items || [];
        if (!this.productId && this.products[0]?._id) {
          this.productId = this.products[0]._id;
        }
      },
      error: () => (this.products = []),
    });
  }

  locationName(id: string, type: string): string {
    if (type === 'warehouse') {
      return this.warehouses.find((warehouse) => warehouse._id === id)?.name || id;
    }
    return this.stores.find((store) => store._id === id)?.name || id;
  }

  createTransfer(): void {
    if (!this.fromLocationId || !this.toLocationId || !this.productId || Number(this.qty) <= 0) {
      this.toastr.error('Select source, destination, product, and a quantity greater than 0.');
      return;
    }

    this.creating = true;
    this.backend
      .createTransfer({
        fromLocationType: this.fromLocationType,
        fromLocationId: this.fromLocationId,
        toLocationType: this.toLocationType,
        toLocationId: this.toLocationId,
        items: [{ productId: this.productId, qty: Number(this.qty) }],
        note: this.note.trim() || undefined,
      })
      .pipe(finalize(() => (this.creating = false)))
      .subscribe({
        next: (response) => {
          this.toastr.success(response.message || 'Transfer created as pending.');
          this.note = '';
          this.loadTransfers();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to create stock transfer.'),
      });
  }

  itemCount(transfer: Transfer): number {
    return transfer.items?.length || 0;
  }

  statusClass(status?: string): string {
    return `pharmacy-status-pill status-${String(status || 'draft').replace(/_/g, '-')}`;
  }

  dateTime(value: string | null | undefined): string {
    return formatDateTime(value);
  }

  canApprove(transfer: Transfer): boolean {
    return this.backend.hasPermission('transfers.approve') && transfer.status === 'pending';
  }

  canDispatch(transfer: Transfer): boolean {
    return this.backend.hasPermission('transfers.dispatch') && transfer.status === 'approved';
  }

  canReceive(transfer: Transfer): boolean {
    return this.backend.hasPermission('transfers.receive') && transfer.status === 'dispatched';
  }

  canCancel(transfer: Transfer): boolean {
    return (
      this.backend.hasPermission('transfers.cancel') &&
      ['draft', 'pending', 'approved'].includes(transfer.status)
    );
  }

  async approve(transfer: Transfer): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'Approve Transfer',
      message: `Approve ${transfer.transferNo}?`,
      confirmText: 'Approve',
    });
    if (!ok) {
      return;
    }
    this.runAction(transfer._id, 'approve');
  }

  async dispatch(transfer: Transfer): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'Dispatch Transfer',
      message: `Mark ${transfer.transferNo} as dispatched?`,
      confirmText: 'Dispatch',
    });
    if (!ok) {
      return;
    }
    this.runAction(transfer._id, 'dispatch');
  }

  async receive(transfer: Transfer): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'Receive Transfer',
      message: `Confirm receipt of ${transfer.transferNo}?`,
      confirmText: 'Receive',
    });
    if (!ok) {
      return;
    }
    this.runAction(transfer._id, 'receive');
  }

  async cancel(transfer: Transfer): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'Cancel Transfer',
      message: `Cancel ${transfer.transferNo}?`,
      confirmText: 'Cancel Transfer',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    this.runAction(transfer._id, 'cancel');
  }

  private runAction(id: string, action: 'approve' | 'dispatch' | 'receive' | 'cancel'): void {
    const request =
      action === 'approve'
        ? this.backend.approveTransfer(id)
        : action === 'dispatch'
          ? this.backend.dispatchTransfer(id)
          : action === 'receive'
            ? this.backend.receiveTransfer(id)
            : this.backend.cancelTransfer(id);

    this.actingId = id;
    request.pipe(finalize(() => (this.actingId = ''))).subscribe({
      next: () => {
        const done: Record<typeof action, string> = {
          approve: 'approved',
          dispatch: 'dispatched',
          receive: 'received',
          cancel: 'cancelled',
        };
        this.toastr.success(`Transfer ${done[action]}.`);
        this.loadTransfers();
      },
      error: (err) => this.toastr.error(err?.error?.message || `Unable to ${action} transfer.`),
    });
  }
}
