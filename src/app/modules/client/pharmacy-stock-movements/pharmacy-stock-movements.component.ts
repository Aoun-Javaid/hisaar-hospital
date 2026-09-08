import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { BackendService } from '../../../core/services/backend.service';
import { StockMovement } from '../../../shared/models/hospital.model';
import { formatDateTime } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-stock-movements',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pharmacy-stock-movements.component.html',
  styleUrl: './pharmacy-stock-movements.component.scss',
})
export class PharmacyStockMovementsComponent implements OnInit {
  movements: StockMovement[] = [];
  loading = false;
  referenceType = '';
  locationType = '';
  fromDate = '';
  toDate = '';

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadMovements();
  }

  get stockInCount(): number {
    return this.movements.filter((movement) => this.isInbound(movement)).length;
  }

  get stockOutCount(): number {
    return this.movements.filter((movement) => !this.isInbound(movement)).length;
  }

  get locationCount(): number {
    return new Set(
      this.movements.map((movement) => `${movement.locationType || ''}:${movement.locationId || movement.location?.name || ''}`)
    ).size;
  }

  private isInbound(movement: StockMovement): boolean {
    const type = String(movement.movementType || '').toUpperCase();
    if (type.includes('IN') || type.includes('RECEIVE') || type.includes('RETURN') || type.includes('OPENING')) {
      return true;
    }
    if (type.includes('OUT') || type.includes('SALE') || type.includes('DISPATCH')) {
      return false;
    }
    return Number(movement.quantityChange ?? movement.qty ?? movement.quantity ?? 0) >= 0;
  }

  loadMovements(): void {
    this.loading = true;
    this.backend.getStockMovements({
      limit: 100,
      referenceType: this.referenceType || undefined,
      locationType: this.locationType || undefined,
      fromDate: this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : undefined,
      toDate: this.toDate ? new Date(`${this.toDate}T23:59:59`).toISOString() : undefined,
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.movements = result.items),
        error: (err) => {
          this.movements = [];
          this.toastr.error(err?.error?.message || 'Unable to load stock movements.');
        },
      });
  }

  reset(): void {
    this.referenceType = '';
    this.locationType = '';
    this.fromDate = '';
    this.toDate = '';
    this.loadMovements();
  }

  productName(movement: StockMovement): string {
    return movement.product?.name || '-';
  }

  productSku(movement: StockMovement): string {
    return movement.product?.sku || '';
  }

  locationLabel(movement: StockMovement): string {
    const name = movement.location?.name;
    if (name) {
      return `${movement.locationType || 'location'} / ${name}`;
    }
    return `${movement.locationType || '-'} / ${movement.locationId || '-'}`;
  }

  qty(movement: StockMovement): string {
    return this.numeric(movement.quantityChange ?? movement.qty ?? movement.quantity);
  }

  balance(movement: StockMovement): string {
    return this.numeric(movement.stockAfter ?? movement.balanceQty);
  }

  dateTime(value: string | null | undefined): string {
    return formatDateTime(value);
  }

  referenceTypeLabel(type: string | null | undefined): string {
    const labels: Record<string, string> = {
      purchase: 'Purchase',
      sale: 'Sale',
      sales_return: 'Sales return',
      purchase_return: 'Purchase return',
      stock_transfer: 'Transfer',
      adjustment: 'Adjustment',
      opening_stock: 'Opening stock',
      ward_requisition: 'Ward issue',
    };
    return (type && labels[type]) || type || '-';
  }

  movementTypeLabel(type: string | null | undefined): string {
    if (!type) {
      return '-';
    }
    return type.replace(/_/g, ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
  }

  referenceDocLabel(movement: StockMovement): string {
    const note = String(movement.note || '');
    const match = note.match(/\b(?:SAL|SRET|PUR|TRF|WRQ|EXP)-[A-Z0-9-]+\b/i);
    return match ? match[0] : '';
  }

  private numeric(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : String(value);
  }
}
