import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import {
  WardBedManagementFilters,
  WardBedRecord,
  WardBedStatus,
  WardBedType,
  WardGalleryOption,
  WardRoomRecord,
  WardRoomType,
} from './ward-bed-management.models';
import { HospitalWard, WardFloor } from '../../../shared/models/hospital.model';
import { WardDataService } from './services/ward-data.service';
import {
  buildFloorOptions,
  isPersistedWardBedId,
  normalizeHospitalWardRecord,
  normalizeWardFloorRecord,
} from './services/ward-api.mapper';

type ActiveModal = 'ward' | 'floor' | 'room' | 'bed' | 'status' | 'viewBed' | 'transfer' | null;
type DetailTab = 'rooms' | 'beds' | 'occupancy' | 'analytics';

interface TransferContext {
  admissionId: string;
  patientName: string;
  currentBedNo: string;
  currentRoomId: string;
  currentBedId: string;
}

interface BedDetailContext {
  bedId: string;
  roomId: string;
  bedNo: string;
}

interface WardSummaryCard {
  id: string;
  name: string;
  floorCount: number;
  roomCount: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  cleaningBeds: number;
  outOfServiceBeds: number;
  occupancyPercent: number;
}

interface BedActivityRow {
  id: string;
  time: string;
  bedNo: string;
  patientName: string;
  status: 'checked_in' | 'cleaning' | 'checked_out';
  details: string;
  staff: string;
}

@Component({
  selector: 'app-ward-bed-management',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './ward-bed-management.component.html',
  styleUrl: './ward-bed-management.component.scss',
})
export class WardBedManagementComponent implements OnInit, OnDestroy {
  loading = false;
  rooms: WardRoomRecord[] = [];
  beds: WardBedRecord[] = [];
  selectedRoomId = '';
  activeModal: ActiveModal = null;
  roomModalMode: 'add' | 'edit' = 'add';
  bedModalMode: 'add' | 'edit' = 'add';
  selectedBed: WardBedRecord | null = null;
  statusReason = '';
  filtersExpanded = false;
  detailTab: DetailTab = 'rooms';
  showAllActivity = false;

  wardOptions: string[] = [];
  galleryOptions: WardGalleryOption[] = [];
  hospitalWards: HospitalWard[] = [];
  wardFloors: WardFloor[] = [];
  activeWardId = '';
  activeWardName = '';
  selectedWardId = '';
  canAddFloor = false;
  canAddRoom = false;
  hasWardSetup = false;
  roomFormFloors: WardFloor[] = [];
  bedFormFloors: WardFloor[] = [];
  bedFormRooms: WardRoomRecord[] = [];
  transferFloors: WardFloor[] = [];
  transferRooms: WardRoomRecord[] = [];
  transferContext: TransferContext = {
    admissionId: '',
    patientName: '',
    currentBedNo: '',
    currentRoomId: '',
    currentBedId: '',
  };
  private roomFormWardSub?: Subscription;
  private bedFormWardSub?: Subscription;
  private routeSub?: Subscription;
  private pendingTransferContext: TransferContext | null = null;
  private pendingBedDetailContext: BedDetailContext | null = null;
  readonly roomTypeOptions: Array<{ value: string; label: string }> = [
    { value: '', label: 'All Room Types' },
    { value: 'general', label: 'General Ward' },
    { value: 'private', label: 'Private Room' },
    { value: 'icu', label: 'ICU' },
    { value: 'isolation', label: 'Isolation' },
    { value: 'recovery', label: 'Recovery' },
  ];
  readonly bedStatusOptions: Array<{ value: string; label: string }> = [
    { value: '', label: 'All Bed Status' },
    { value: 'available', label: 'Available' },
    { value: 'occupied', label: 'Occupied' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'cleaning', label: 'Cleaning' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'blocked', label: 'Blocked' },
  ];
  readonly bedTypeOptions: WardBedType[] = ['standard', 'pediatric', 'icu', 'isolation', 'attendant', 'emergency'];
  readonly changeStatusOptions: WardBedStatus[] = ['available', 'on_hold', 'cleaning', 'maintenance', 'blocked'];

  filters: WardBedManagementFilters = {
    ward: '',
    gallery: '',
    roomType: '',
    bedStatus: '',
    search: '',
    date: new Date().toISOString().slice(0, 10),
  };

  roomForm: FormGroup;
  bedForm: FormGroup;
  statusForm: FormGroup;
  wardForm: FormGroup;
  floorForm: FormGroup;
  transferForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
    private wardData: WardDataService
  ) {
    this.roomForm = this.fb.group({
      wardId: ['', Validators.required],
      floorId: ['', Validators.required],
      roomName: ['', Validators.required],
      roomType: ['general', Validators.required],
      capacity: [1, [Validators.required, Validators.min(1)]],
      dailyCharge: [0, [Validators.required, Validators.min(0)]],
      description: [''],
    });

    this.bedForm = this.fb.group({
      wardId: ['', Validators.required],
      floorId: ['', Validators.required],
      roomId: ['', Validators.required],
      bedNo: ['', Validators.required],
      bedType: ['standard', Validators.required],
      status: ['available', Validators.required],
      dailyCharge: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
    });

    this.wardForm = this.fb.group({
      name: ['', Validators.required],
      code: [''],
      description: [''],
    });

    this.floorForm = this.fb.group({
      wardId: ['', Validators.required],
      name: ['', Validators.required],
      label: [''],
    });

    this.transferForm = this.fb.group({
      wardId: ['', Validators.required],
      floorId: [''],
      roomId: ['', Validators.required],
      bedId: [''],
      bedLabel: [''],
      notes: [''],
    });

    this.statusForm = this.fb.group({
      status: ['available', Validators.required],
      reason: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const action = params.get('action') || '';
      const admissionId = params.get('admissionId') || '';
      const transferBedId = params.get('transferBedId') || '';
      const bedId = params.get('bedId') || '';
      const roomId = params.get('roomId') || '';
      const bedNo = params.get('bedNo') || '';

      if (action === 'details' || (!admissionId && !transferBedId && (bedId || roomId || bedNo))) {
        this.pendingBedDetailContext = { bedId, roomId, bedNo };
        this.openPendingBedDetail();
      }

      if (!admissionId && !transferBedId) {
        return;
      }

      this.pendingTransferContext = {
        admissionId,
        patientName: params.get('patientName') || '',
        currentBedNo: params.get('bedNo') || '',
        currentRoomId: params.get('roomId') || '',
        currentBedId: transferBedId,
      };
      this.openPendingTransfer();
    });
    this.loadData();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.unbindRoomFormWardListener();
    this.unbindBedFormWardListener();
  }

  get filteredRooms(): WardRoomRecord[] {
    const query = this.filters.search.trim().toLowerCase();
    return this.rooms.filter((room) => {
      const matchesWard = !this.filters.ward || room.wardName === this.filters.ward;
      const matchesGallery = !this.filters.gallery || room.galleryId === this.filters.gallery;
      const matchesRoomType = !this.filters.roomType || room.roomType === this.filters.roomType;
      const matchesSearch =
        !query ||
        [room.roomName, room.galleryName, room.floor, room.description].join(' ').toLowerCase().includes(query);
      return matchesWard && matchesGallery && matchesRoomType && matchesSearch;
    });
  }

  get floorsForSelectedWard(): WardFloor[] {
    const wardId = String(this.selectedWardId || '');
    return this.wardFloors.filter((floor) => !wardId || String(floor.wardId) === wardId);
  }

  get bedKpis(): {
    total: number;
    available: number;
    occupied: number;
    cleaning: number;
    outOfService: number;
    availablePct: number;
    occupiedPct: number;
    cleaningPct: number;
    outOfServicePct: number;
  } {
    const total = this.beds.length;
    const available = this.beds.filter((bed) => bed.status === 'available').length;
    const occupied = this.beds.filter((bed) => bed.status === 'occupied').length;
    const cleaning = this.beds.filter((bed) => bed.status === 'cleaning').length;
    const outOfService = this.beds.filter(
      (bed) => bed.status === 'maintenance' || bed.status === 'blocked'
    ).length;
    const pct = (value: number) => (total ? Math.round((value / total) * 100) : 0);
    return {
      total,
      available,
      occupied,
      cleaning,
      outOfService,
      availablePct: pct(available),
      occupiedPct: pct(occupied),
      cleaningPct: pct(cleaning),
      outOfServicePct: pct(outOfService),
    };
  }

  get wardSummaries(): WardSummaryCard[] {
    const wards =
      this.hospitalWards.length > 0
        ? this.hospitalWards
        : this.wardOptions.map((name, index) => ({
            _id: `name:${name}`,
            hospitalId: '',
            name,
            status: 'active' as const,
          }));

    return wards.map((ward) => {
      const wardId = String(ward._id || '');
      const byId = wardId && !wardId.startsWith('name:');
      const wardRooms = this.rooms.filter((room) =>
        byId ? String(room.wardId) === wardId : room.wardName === ward.name
      );
      const roomIds = new Set(wardRooms.map((room) => room.id));
      const wardBeds = this.beds.filter((bed) => roomIds.has(bed.roomId));
      const totalBeds = wardBeds.length || wardRooms.reduce((sum, room) => sum + (room.capacity || 0), 0);
      const occupiedBeds = wardBeds.filter((bed) => bed.status === 'occupied').length;
      const availableBeds = wardBeds.filter((bed) => bed.status === 'available').length;
      const cleaningBeds = wardBeds.filter((bed) => bed.status === 'cleaning').length;
      const outOfServiceBeds = wardBeds.filter(
        (bed) => bed.status === 'maintenance' || bed.status === 'blocked'
      ).length;
      const floorIds = new Set(
        [
          ...this.wardFloors
            .filter((floor) => (byId ? String(floor.wardId) === wardId : false))
            .map((floor) => String(floor._id)),
          ...wardRooms.map((room) => String(room.galleryId)).filter(Boolean),
        ].filter(Boolean)
      );

      return {
        id: wardId,
        name: ward.name,
        floorCount: floorIds.size,
        roomCount: wardRooms.length,
        totalBeds,
        occupiedBeds,
        availableBeds,
        cleaningBeds,
        outOfServiceBeds,
        occupancyPercent: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      };
    });
  }

  get selectedWardSummary(): WardSummaryCard | null {
    const byFilter = this.wardSummaries.find((ward) => ward.name === this.filters.ward);
    if (byFilter) {
      return byFilter;
    }
    return this.wardSummaries.find((ward) => ward.id === this.selectedWardId) || this.wardSummaries[0] || null;
  }

  get selectedWardRooms(): WardRoomRecord[] {
    return this.filteredRooms;
  }

  get selectedWardBeds(): WardBedRecord[] {
    const roomIds = new Set(this.selectedWardRooms.map((room) => room.id));
    const query = this.filters.search.trim().toLowerCase();
    return this.beds
      .filter((bed) => roomIds.has(bed.roomId))
      .filter((bed) => !this.filters.bedStatus || bed.status === this.filters.bedStatus)
      .filter((bed) => {
        if (!query) {
          return true;
        }
        return [bed.bedNo, bed.patientName, bed.nurseName, bed.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.bedNo.localeCompare(b.bedNo, undefined, { numeric: true }));
  }

  get recentBedActivity(): BedActivityRow[] {
    const roomById = new Map(this.rooms.map((room) => [room.id, room]));
    const rows: BedActivityRow[] = this.beds
      .filter((bed) => bed.status === 'occupied' || bed.status === 'cleaning' || bed.occupiedSince)
      .map((bed) => {
        const room = roomById.get(bed.roomId);
        const stamp = bed.occupiedSince ? new Date(bed.occupiedSince) : null;
        const time =
          stamp && !Number.isNaN(stamp.getTime())
            ? stamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : '—';

        if (bed.status === 'cleaning') {
          return {
            id: bed.id,
            time,
            bedNo: bed.bedNo,
            patientName: bed.patientName || '—',
            status: 'cleaning' as const,
            details: room ? `Cleaning scheduled for ${room.roomName}` : 'Bed marked for cleaning',
            staff: bed.nurseName || '—',
          };
        }

        return {
          id: bed.id,
          time,
          bedNo: bed.bedNo,
          patientName: bed.patientName || '—',
          status: 'checked_in' as const,
          details: room ? `Patient admitted to ${room.roomName}` : 'Patient admitted to bed',
          staff: bed.nurseName || '—',
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time))
      .reverse();

    return this.showAllActivity ? rows : rows.slice(0, 8);
  }

  get wardDescriptionLength(): number {
    return String(this.wardForm.get('description')?.value || '').length;
  }

  get roomNotesLength(): number {
    return String(this.roomForm.get('description')?.value || '').length;
  }

  get bedNotesLength(): number {
    return String(this.bedForm.get('notes')?.value || '').length;
  }

  get bedStatusDotClass(): string {
    return this.statusDotClass(String(this.bedForm.get('status')?.value || 'available'));
  }

  private isMongoId(value: string | null | undefined): boolean {
    return /^[a-f\d]{24}$/i.test(String(value || '').trim());
  }

  private resolveSelectedWardId(): string {
    const wardName = String(this.filters.ward || '').trim();

    const fromCatalog = this.hospitalWards.find((ward) => ward.name === wardName)?._id;
    if (fromCatalog) {
      return fromCatalog;
    }

    if (wardName && wardName === this.activeWardName && this.activeWardId) {
      return this.activeWardId;
    }

    const fromFloor = this.wardFloors.find((floor) => floor._id === this.filters.gallery)?.wardId;
    if (this.isMongoId(fromFloor)) {
      return String(fromFloor);
    }

    const fromRoom = this.rooms.find(
      (room) => (!wardName || room.wardName === wardName) && this.isMongoId(room.wardId)
    )?.wardId;
    if (fromRoom) {
      return fromRoom;
    }

    const fromSelectedRoom = this.selectedRoom?.wardId;
    if (this.isMongoId(fromSelectedRoom)) {
      return String(fromSelectedRoom);
    }

    const fromAnyFloor = this.wardFloors.find((floor) => this.isMongoId(floor.wardId))?.wardId;
    if (fromAnyFloor) {
      return String(fromAnyFloor);
    }

    return this.hospitalWards[0]?._id || this.activeWardId || '';
  }

  private hydrateHospitalWardsFromContext(): void {
    const merged = new Map<string, HospitalWard>(this.hospitalWards.map((ward) => [String(ward._id), ward]));
    const wardName = String(this.filters.ward || '').trim();

    this.rooms.forEach((room) => {
      if (!this.isMongoId(room.wardId)) {
        return;
      }

      const existing = merged.get(room.wardId);
      merged.set(room.wardId, {
        _id: room.wardId,
        hospitalId: existing?.hospitalId || '',
        name: existing?.name || room.wardName || wardName || `Ward ${room.wardId.slice(-6)}`,
        code: existing?.code || '',
        description: existing?.description || '',
        status: existing?.status || 'active',
      });
    });

    this.wardFloors.forEach((floor) => {
      if (!this.isMongoId(floor.wardId)) {
        return;
      }

      const existing = merged.get(String(floor.wardId));
      if (existing) {
        return;
      }

      merged.set(String(floor.wardId), {
        _id: String(floor.wardId),
        hospitalId: floor.hospitalId || '',
        name: `Ward ${String(floor.wardId).slice(-6)}`,
        status: floor.status === 'inactive' ? 'inactive' : 'active',
      });
    });

    if (!merged.size) {
      return;
    }

    this.hospitalWards = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.wardOptions = Array.from(new Set([...this.wardOptions, ...this.hospitalWards.map((ward) => ward.name)])).sort(
      (a, b) => a.localeCompare(b)
    );

    if (!this.filters.ward && this.hospitalWards.length) {
      const activeId = this.resolveSelectedWardId();
      const activeWard = this.hospitalWards.find((ward) => ward._id === activeId) || this.hospitalWards[0];
      if (activeWard) {
        this.filters.ward = activeWard.name;
        this.rememberActiveWard(activeWard);
      }
    }
    this.refreshActionState();
  }

  get selectedRoom(): WardRoomRecord | null {
    return this.rooms.find((room) => room.id === this.selectedRoomId) || this.filteredRooms[0] || null;
  }

  get transferAvailableBeds(): WardBedRecord[] {
    const roomId = String(this.transferForm.get('roomId')?.value || '');
    const currentBedId = String(this.transferContext.currentBedId || '');
    return this.beds
      .filter((bed) => bed.roomId === roomId)
      .filter((bed) => bed.status === 'available')
      .filter((bed) => !currentBedId || bed.id !== currentBedId)
      .sort((a, b) => a.bedNo.localeCompare(b.bedNo, undefined, { numeric: true }));
  }

  get roomBeds(): WardBedRecord[] {
    if (!this.selectedRoom) {
      return [];
    }

    const query = this.filters.search.trim().toLowerCase();
    return this.beds
      .filter((bed) => bed.roomId === this.selectedRoom?.id)
      .filter((bed) => !this.filters.bedStatus || bed.status === this.filters.bedStatus)
      .filter((bed) => {
        if (!query) {
          return true;
        }

        return [bed.bedNo, bed.patientName, bed.nurseName, bed.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      });
  }

  get canDeleteSelectedRoom(): boolean {
    return Boolean(this.selectedRoom && this.selectedRoom.occupiedBeds === 0);
  }

  private refreshActionState(): void {
    this.selectedWardId = this.resolveSelectedWardId();
    this.canAddFloor = Boolean(this.selectedWardId);
    this.canAddRoom = this.canAddFloor;
    this.hasWardSetup =
      this.hospitalWards.length > 0 || Boolean(this.selectedWardId) || this.wardOptions.length > 0;
  }

  private refreshRoomFormFloors(): void {
    const wardId = String(this.roomForm.get('wardId')?.value || this.selectedWardId);
    this.syncPlacementFloors(wardId, 'room');
  }

  private refreshBedFormFloors(): void {
    const wardId = String(this.bedForm.get('wardId')?.value || this.selectedWardId);
    this.syncPlacementFloors(wardId, 'bed');
  }

  private refreshBedFormRooms(): void {
    const wardId = String(this.bedForm.get('wardId')?.value || '');
    const floorId = String(this.bedForm.get('floorId')?.value || '');
    this.bedFormRooms = this.rooms.filter((room) => {
      const matchesWard = !wardId || String(room.wardId) === wardId;
      const matchesFloor = !floorId || String(room.galleryId) === floorId;
      return matchesWard && matchesFloor;
    });
  }

  private openPendingTransfer(): void {
    if (!this.pendingTransferContext || this.loading || (!this.rooms.length && !this.beds.length)) {
      return;
    }

    const context = this.pendingTransferContext;
    this.pendingTransferContext = null;
    const bed =
      (context.currentBedId && this.beds.find((item) => item.id === context.currentBedId)) ||
      (context.admissionId && this.beds.find((item) => item.admissionId === context.admissionId)) ||
      (context.currentRoomId && context.currentBedNo
        ? this.beds.find(
            (item) => item.roomId === context.currentRoomId && item.bedNo === context.currentBedNo
          )
        : null);

    if (bed) {
      this.openTransferForBed(bed, context);
      return;
    }

    if (context.admissionId) {
      this.openTransferModal(context);
    }
  }

  private openPendingBedDetail(): void {
    if (!this.pendingBedDetailContext || this.loading || (!this.rooms.length && !this.beds.length)) {
      return;
    }

    const context = this.pendingBedDetailContext;
    this.pendingBedDetailContext = null;
    const bed =
      (context.bedId && this.beds.find((item) => item.id === context.bedId)) ||
      (context.roomId && context.bedNo
        ? this.beds.find((item) => item.roomId === context.roomId && item.bedNo === context.bedNo)
        : null) ||
      (context.roomId ? this.beds.find((item) => item.roomId === context.roomId) : null) ||
      (context.bedNo ? this.beds.find((item) => item.bedNo === context.bedNo) : null);

    if (!bed) {
      this.toastr.warning('Bed detail not found.');
      return;
    }

    this.selectedRoomId = bed.roomId;
    const room = this.rooms.find((item) => item.id === bed.roomId);
    if (room?.wardName) {
      this.filters.ward = room.wardName;
    }
    if (room?.galleryId) {
      this.filters.gallery = room.galleryId;
    }
    this.openViewBed(bed, true);
  }

  private openTransferForBed(bed: WardBedRecord, overrides: Partial<TransferContext> = {}): void {
    const admissionId = overrides.admissionId || bed.admissionId || '';
    if (!admissionId) {
      this.toastr.warning('No active admission found for this bed.');
      return;
    }

    this.openTransferModal({
      admissionId,
      patientName: overrides.patientName || bed.patientName || '',
      currentBedNo: overrides.currentBedNo || bed.bedNo,
      currentRoomId: overrides.currentRoomId || bed.roomId,
      currentBedId: overrides.currentBedId || bed.id,
    });
  }

  private openTransferModal(context: TransferContext): void {
    const currentRoom = this.rooms.find((room) => room.id === context.currentRoomId) || this.selectedRoom;
    const defaultBed = this.beds.find(
      (bed) => bed.status === 'available' && bed.id !== context.currentBedId
    );
    const defaultRoom =
      (defaultBed ? this.rooms.find((room) => room.id === defaultBed.roomId) : null) ||
      this.rooms.find((room) => room.id !== context.currentRoomId && room.availableBeds > 0) ||
      currentRoom ||
      this.rooms[0];

    this.transferContext = context;
    this.transferForm.reset(
      {
        wardId: defaultRoom?.wardId || currentRoom?.wardId || this.selectedWardId || '',
        floorId: defaultRoom?.galleryId || currentRoom?.galleryId || '',
        roomId: defaultRoom?.id || '',
        bedId: defaultBed?.id || '',
        bedLabel: defaultBed?.bedNo || context.currentBedNo || '',
        notes: '',
      },
      { emitEvent: false }
    );
    this.syncTransferPlacement();
    this.activeModal = 'transfer';
  }

  onTransferWardChange(): void {
    const wardId = String(this.transferForm.get('wardId')?.value || '');
    const floors = this.resolveFloorsForWard(wardId);
    this.transferForm.patchValue({ floorId: floors[0]?._id || '' }, { emitEvent: false });
    this.syncTransferPlacement();
  }

  onTransferFloorChange(): void {
    this.syncTransferPlacement();
  }

  onTransferRoomChange(): void {
    this.syncTransferBedSelection();
  }

  onTransferBedChange(): void {
    const bedId = String(this.transferForm.get('bedId')?.value || '');
    const bed = this.beds.find((item) => item.id === bedId);
    if (!bed) {
      return;
    }

    const room = this.rooms.find((item) => item.id === bed.roomId);
    this.transferForm.patchValue(
      {
        roomId: bed.roomId,
        wardId: room?.wardId || this.transferForm.get('wardId')?.value || '',
        floorId: room?.galleryId || this.transferForm.get('floorId')?.value || '',
        bedLabel: bed.bedNo,
      },
      { emitEvent: false }
    );
    this.syncTransferPlacement();
  }

  private syncTransferPlacement(): void {
    const wardId = String(this.transferForm.get('wardId')?.value || '');
    const floorId = String(this.transferForm.get('floorId')?.value || '');
    this.transferFloors = this.resolveFloorsForWard(wardId);

    if (wardId && this.transferFloors.length && !this.transferFloors.some((floor) => floor._id === floorId)) {
      this.transferForm.patchValue({ floorId: this.transferFloors[0]._id }, { emitEvent: false });
    }

    const activeFloorId = String(this.transferForm.get('floorId')?.value || '');
    this.transferRooms = this.rooms
      .filter((room) => !wardId || room.wardId === wardId)
      .filter((room) => !activeFloorId || room.galleryId === activeFloorId)
      .sort((a, b) => a.roomName.localeCompare(b.roomName, undefined, { numeric: true }));

    const currentRoomId = String(this.transferForm.get('roomId')?.value || '');
    if (!this.transferRooms.some((room) => room.id === currentRoomId)) {
      const preferred =
        this.transferRooms.find((room) => room.availableBeds > 0 && room.id !== this.transferContext.currentRoomId) ||
        this.transferRooms[0];
      this.transferForm.patchValue({ roomId: preferred?.id || '' }, { emitEvent: false });
    }

    this.syncTransferBedSelection();
  }

  private syncTransferBedSelection(): void {
    const bedId = String(this.transferForm.get('bedId')?.value || '');
    const availableBeds = this.transferAvailableBeds;
    const selectedBed = availableBeds.find((bed) => bed.id === bedId);
    const nextBed = selectedBed || availableBeds[0];

    this.transferForm.patchValue(
      {
        bedId: nextBed?.id || '',
        bedLabel: nextBed?.bedNo || this.transferForm.get('bedLabel')?.value || '',
      },
      { emitEvent: false }
    );
  }

  private rememberActiveWard(ward: HospitalWard | null | undefined): void {
    if (!ward?._id || !ward?.name) {
      return;
    }

    this.activeWardId = String(ward._id);
    this.activeWardName = ward.name;
    this.refreshActionState();
  }

  private mergeHospitalWards(...groups: HospitalWard[][]): HospitalWard[] {
    const merged = new Map<string, HospitalWard>();
    groups.flat().forEach((ward) => {
      const normalized = normalizeHospitalWardRecord(ward);
      if (!normalized?._id || !normalized?.name) {
        return;
      }
      merged.set(String(normalized._id), normalized);
    });
    return Array.from(merged.values());
  }

  private applyHospitalWards(incoming: HospitalWard[], preferredName = ''): void {
    if (!incoming.length && !this.hospitalWards.length) {
      return;
    }

    this.hospitalWards = this.mergeHospitalWards(this.hospitalWards, incoming);
    this.wardOptions = Array.from(
      new Set([...this.wardOptions, ...this.hospitalWards.map((ward) => ward.name)])
    ).sort((a, b) => a.localeCompare(b));

    const wards = this.hospitalWards;
    const preferred =
      preferredName && wards.some((ward) => ward.name === preferredName)
        ? preferredName
        : this.filters.ward && wards.some((ward) => ward.name === this.filters.ward)
          ? this.filters.ward
          : wards[0]?.name || '';

    if (preferred) {
      this.filters.ward = preferred;
      this.rememberActiveWard(wards.find((ward) => ward.name === preferred) || wards[0]);
    }
    this.refreshActionState();
  }

  private refreshGalleryForSelectedWard(): void {
    const wardId = this.resolveSelectedWardId();
    const fromFloors = buildFloorOptions(this.wardFloors, wardId);
    const fromRooms = this.buildGalleryOptions(
      this.rooms.filter((room) => wardId && String(room.wardId) === wardId)
    );
    this.galleryOptions = fromFloors.length ? fromFloors : fromRooms;

    if (this.filters.gallery && !this.galleryOptions.some((option) => option.id === this.filters.gallery)) {
      this.filters.gallery = '';
    }
  }

  private upsertWardFloorsForWard(wardId: string, floors: WardFloor[]): void {
    const id = String(wardId || '').trim();
    if (!id) {
      return;
    }

    const normalized = floors.map((floor) => ({
      ...floor,
      _id: String(floor._id),
      wardId: id,
    }));
    const otherWardFloors = this.wardFloors.filter((floor) => String(floor.wardId) !== id);
    this.wardFloors = this.mergeWardFloors(otherWardFloors, normalized);
  }

  private reloadFloorsForWard(wardId: string, onDone?: () => void): void {
    const id = String(wardId || '').trim();
    if (!id) {
      onDone?.();
      return;
    }

    this.wardData.fetchWardFloors(id).subscribe({
      next: (floors) => {
        this.upsertWardFloorsForWard(id, floors);
        if (String(this.resolveSelectedWardId()) === id) {
          this.refreshGalleryForSelectedWard();
        }
        onDone?.();
      },
      error: () => onDone?.(),
    });
  }

  loadData(): void {
    const previousWards = this.hospitalWards;
    const previousFloors = this.wardFloors;
    const previousWardFilter = this.filters.ward;
    this.loading = true;
    this.wardData.loadBedManagement(this.filters.ward).subscribe({
      next: (data) => {
        const loadedWards = this.mergeHospitalWards(data.hospitalWards || [], previousWards);
        if (loadedWards.length) {
          this.applyHospitalWards(loadedWards, previousWardFilter || this.filters.ward);
        } else if (previousWards.length) {
          this.applyHospitalWards(previousWards, previousWardFilter || this.filters.ward);
          if (data.wardOptions.length) {
            this.wardOptions = Array.from(new Set([...this.wardOptions, ...data.wardOptions]));
          }
        } else {
          this.hospitalWards = [];
          this.wardOptions = data.wardOptions;
        }

        this.wardFloors = (data.wardFloors || []).length
          ? this.mergeWardFloors(data.wardFloors, previousFloors)
          : previousFloors;
        this.rooms = data.rooms;
        this.beds = data.beds;

        if (!data.hospitalWards?.length && previousWards.length) {
          this.toastr.warning('Ward list could not be refreshed from the server. Showing saved wards.');
        }

        this.recalculateRoomCounts();
        this.hydrateHospitalWardsFromContext();
        const activeWardId = this.resolveSelectedWardId();
        if (activeWardId) {
          this.reloadFloorsForWard(activeWardId, () => {
            this.refreshGalleryForSelectedWard();
            this.refreshActionState();
            this.selectedRoomId = this.filteredRooms[0]?.id || '';
            this.loading = false;
            this.openPendingTransfer();
            this.openPendingBedDetail();
          });
          return;
        }

        this.refreshGalleryForSelectedWard();
        this.refreshActionState();
        this.selectedRoomId = this.filteredRooms[0]?.id || '';
        this.loading = false;
        this.openPendingTransfer();
        this.openPendingBedDetail();
      },
      error: () => {
        this.rooms = [];
        this.beds = [];
        this.loading = false;
        this.toastr.error('Failed to load bed management data.');
      },
    });
  }

  onWardFilterChange(): void {
    const ward = this.hospitalWards.find((item) => item.name === this.filters.ward);
    if (ward) {
      this.rememberActiveWard(ward);
      this.reloadFloorsForWard(String(ward._id), () => {
        this.selectedRoomId = this.filteredRooms[0]?.id || '';
        this.refreshActionState();
      });
      return;
    }

    this.refreshGalleryForSelectedWard();
    this.selectedRoomId = this.filteredRooms[0]?.id || '';
    this.refreshActionState();
  }

  refresh(): void {
    this.loadData();
    this.toastr.success('Bed management data refreshed.');
  }

  applyFilters(): void {
    this.selectedRoomId = this.filteredRooms[0]?.id || '';
    this.refreshActionState();
  }

  toggleFilters(): void {
    this.filtersExpanded = !this.filtersExpanded;
  }

  selectWard(ward: WardSummaryCard): void {
    this.filters.ward = ward.name;
    const catalog = this.hospitalWards.find((item) => item._id === ward.id || item.name === ward.name);
    if (catalog) {
      this.rememberActiveWard(catalog);
      this.reloadFloorsForWard(String(catalog._id), () => {
        this.selectedRoomId = this.filteredRooms[0]?.id || '';
        this.refreshActionState();
      });
      return;
    }

    this.refreshGalleryForSelectedWard();
    this.selectedRoomId = this.filteredRooms[0]?.id || '';
    this.refreshActionState();
  }

  setDetailTab(tab: DetailTab): void {
    this.detailTab = tab;
  }

  openRoomFromCard(roomId: string): void {
    this.selectRoom(roomId);
    this.detailTab = 'beds';
  }

  roomOccupancyPercent(room: WardRoomRecord): number {
    const total = Math.max(room.capacity || 0, room.occupiedBeds + room.availableBeds + room.cleaningBeds + room.maintenanceBeds + room.onHoldBeds);
    if (!total) {
      return 0;
    }
    return Math.round((room.occupiedBeds / total) * 100);
  }

  statusDotClass(status: string): string {
    const key = String(status || '').toLowerCase();
    if (key === 'available') {
      return 'status-dot--available';
    }
    if (key === 'occupied') {
      return 'status-dot--occupied';
    }
    if (key === 'cleaning') {
      return 'status-dot--cleaning';
    }
    if (key === 'maintenance' || key === 'blocked' || key === 'out_of_service') {
      return 'status-dot--oos';
    }
    if (key === 'on_hold') {
      return 'status-dot--hold';
    }
    return 'status-dot--available';
  }

  activityStatusLabel(status: BedActivityRow['status']): string {
    if (status === 'checked_in') {
      return 'Checked In';
    }
    if (status === 'checked_out') {
      return 'Checked Out';
    }
    return 'Cleaning';
  }

  activityStatusClass(status: BedActivityRow['status']): string {
    return `activity-badge--${status}`;
  }

  toggleShowAllActivity(): void {
    this.showAllActivity = !this.showAllActivity;
  }

  selectRoom(roomId: string): void {
    this.selectedRoomId = roomId;
  }

  onRoomTypeFilterChange(): void {
    const firstRoom = this.filteredRooms[0];
    this.selectedRoomId = firstRoom ? firstRoom.id : '';
    this.refreshActionState();
  }

  openAddWard(): void {
    this.wardForm.reset({ name: '', code: '', description: '' });
    this.activeModal = 'ward';
  }

  saveWard(): void {
    if (this.wardForm.invalid) {
      this.wardForm.markAllAsTouched();
      return;
    }

    const value = this.wardForm.getRawValue();
    this.wardData.createHospitalWard({
      name: value.name,
      code: value.code || undefined,
      description: value.description || undefined,
    }).subscribe({
      next: (response) => {
        const createdName = String(value.name || '').trim();
        const responseBody = response as unknown as Record<string, unknown>;
        const created =
          normalizeHospitalWardRecord(response?.data) ||
          normalizeHospitalWardRecord(responseBody?.['data']) ||
          normalizeHospitalWardRecord(response);
        const optimistic = created ? [created] : [];

        if (created) {
          this.rememberActiveWard(created);
          if (createdName) {
            this.filters.ward = createdName;
            this.wardOptions = Array.from(new Set([...this.wardOptions, createdName]));
          }
          this.applyHospitalWards(this.mergeHospitalWards(this.hospitalWards, optimistic), createdName);
        }

        this.wardData.refreshHospitalWards().subscribe({
          next: (wards) => {
            const resolved = this.mergeHospitalWards(this.hospitalWards, wards, optimistic);
            if (resolved.length) {
              this.applyHospitalWards(resolved, createdName);
            } else if (created) {
              this.applyHospitalWards([created], createdName);
            } else {
              this.toastr.warning(
                'Ward may have been created, but it could not be loaded. Check ward read permissions and refresh.'
              );
            }

            this.toastr.success('Ward created successfully.');
            this.closeModal();
            this.loadData();
          },
          error: () => {
            if (created) {
              this.applyHospitalWards([created], createdName);
            }
            this.toastr.success('Ward created successfully.');
            this.closeModal();
            this.loadData();
          },
        });
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Failed to create ward.'),
    });
  }

  openAddFloor(): void {
    const wardId = this.selectedWardId;
    if (!wardId) {
      this.toastr.error('Select or create a ward before adding a floor.');
      return;
    }

    this.floorForm.reset({
      wardId,
      name: '',
      label: '',
    });
    this.activeModal = 'floor';
  }

  saveFloor(): void {
    if (this.floorForm.invalid) {
      this.floorForm.markAllAsTouched();
      return;
    }

    const value = this.floorForm.getRawValue();
    this.wardData.createWardFloor(String(value.wardId), {
      name: value.name,
      label: value.label || undefined,
    }).subscribe({
      next: (response) => {
        const ward = this.hospitalWards.find((item) => item._id === value.wardId);
        if (ward?.name) {
          this.filters.ward = ward.name;
          this.rememberActiveWard(ward);
        }
        const floor = response?.data;
        const normalizedFloor = normalizeWardFloorRecord(floor, String(value.wardId));
        const floorId = String(normalizedFloor?._id || '');
        if (normalizedFloor) {
          this.upsertWardFloorsForWard(String(value.wardId), [normalizedFloor]);
          this.filters.gallery = normalizedFloor._id;
        } else if (floorId && floor) {
          this.upsertWardFloorsForWard(String(value.wardId), [
            {
              _id: floorId,
              hospitalId: String(floor.hospitalId || ''),
              wardId: String(value.wardId),
              name: String(floor.name || value.name || ''),
              label: String(floor.label || value.label || ''),
              status: floor.status || 'active',
            },
          ]);
          this.filters.gallery = floorId;
        }
        this.refreshGalleryForSelectedWard();
        this.reloadFloorsForWard(String(value.wardId));
        this.toastr.success('Floor created successfully.');
        this.closeModal();
      },
      error: (err) => {
        const message = err?.error?.message || 'Failed to create floor.';
        if (err?.error?.error === 'WARD_FLOOR_ALREADY_EXISTS') {
          this.reloadFloorsForWard(String(value.wardId), () => {
            this.refreshGalleryForSelectedWard();
            this.toastr.warning('This floor already exists in the ward. Floor list refreshed.');
          });
          return;
        }
        this.toastr.error(message);
      },
    });
  }

  openAddRoom(): void {
    const wardId = this.selectedWardId;
    if (!wardId) {
      this.toastr.error('Select or create a ward before adding a room.');
      return;
    }

    const floors = this.resolveFloorsForWard(wardId);
    if (!floors.length) {
      this.toastr.warning('No floors found for this ward. Add a floor first or refresh the page.');
    }

    const floorId = floors[0]?._id || this.filters.gallery || this.galleryOptions[0]?.id || '';
    this.roomModalMode = 'add';
    this.roomForm.reset({
      wardId,
      floorId,
      roomName: '',
      roomType: 'general',
      capacity: 1,
      dailyCharge: 2500,
      description: '',
    }, { emitEvent: false });
    this.roomFormFloors = floors;
    this.bindRoomFormWardListener();
    this.syncPlacementFloors(wardId, 'room');
    this.activeModal = 'room';
  }

  openEditRoom(): void {
    const room = this.selectedRoom;
    if (!room) {
      return;
    }

    this.roomModalMode = 'edit';
    this.roomForm.reset({
      wardId: room.wardId,
      floorId: room.galleryId,
      roomName: room.roomName,
      roomType: room.roomType,
      capacity: room.capacity,
      dailyCharge: room.dailyCharge,
      description: room.description,
    }, { emitEvent: false });
    this.bindRoomFormWardListener();
    this.syncPlacementFloors(String(room.wardId), 'room');
    this.activeModal = 'room';
  }

  openAddBed(): void {
    const wardId = this.selectedWardId;
    const floorId = this.filters.gallery || this.galleryOptions[0]?.id || '';
    this.bedModalMode = 'add';
    this.bedForm.reset({
      wardId,
      floorId,
      roomId: this.selectedRoom?.id || '',
      bedNo: '',
      bedType: 'standard',
      status: 'available',
      dailyCharge: this.selectedRoom?.dailyCharge || 2500,
      notes: '',
    }, { emitEvent: false });
    this.bindBedFormWardListener();
    this.syncPlacementFloors(wardId, 'bed');
    this.syncBedFormRoomSelection();
    this.activeModal = 'bed';
  }

  openEditBed(bed: WardBedRecord): void {
    this.bedModalMode = 'edit';
    this.selectedBed = bed;
    const room = this.rooms.find((item) => item.id === bed.roomId);
    this.bedForm.reset({
      wardId: room?.wardId || this.selectedWardId,
      floorId: room?.galleryId || this.filters.gallery,
      roomId: bed.roomId,
      bedNo: bed.bedNo,
      bedType: bed.bedType,
      status: bed.status,
      dailyCharge: bed.dailyCharge,
      notes: bed.notes || '',
    }, { emitEvent: false });
    this.bindBedFormWardListener();
    this.syncPlacementFloors(String(room?.wardId || this.selectedWardId), 'bed');
    this.syncBedFormRoomSelection();
    this.activeModal = 'bed';
  }

  onBedFormPlacementChange(): void {
    this.refreshBedFormRooms();
    this.syncBedFormRoomSelection();
  }

  floorsForWardId(wardId: string): WardFloor[] {
    return this.resolveFloorsForWard(wardId);
  }

  private mergeWardFloors(...groups: WardFloor[][]): WardFloor[] {
    const merged = new Map<string, WardFloor>();
    groups.flat().forEach((floor) => {
      if (!floor?._id) {
        return;
      }
      merged.set(String(floor._id), {
        ...floor,
        _id: String(floor._id),
        wardId: String(floor.wardId || ''),
        name: String(floor.name || floor.label || 'Floor'),
        label: String(floor.label || floor.name || 'Floor'),
      });
    });
    return Array.from(merged.values());
  }

  private mergeGalleryOptions(...groups: WardGalleryOption[][]): WardGalleryOption[] {
    const merged = new Map<string, WardGalleryOption>();
    groups.flat().forEach((option) => {
      if (!option?.id) {
        return;
      }
      merged.set(String(option.id), {
        id: String(option.id),
        label: String(option.label || 'Floor'),
      });
    });
    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  private resolveFloorsForWard(wardId: string): WardFloor[] {
    const id = String(wardId || '').trim();
    if (!id) {
      return [];
    }

    const fromCatalog = this.wardFloors.filter((floor) => String(floor.wardId) === id);

    const knownFloorIds = new Set(fromCatalog.map((floor) => String(floor._id)));
    const fromRooms = this.rooms
      .filter((room) => String(room.wardId) === id && Boolean(room.galleryId))
      .filter((room) => !knownFloorIds.has(String(room.galleryId)))
      .map((room) => ({
        _id: String(room.galleryId),
        hospitalId: '',
        wardId: id,
        name: room.galleryName,
        label: room.galleryName,
        status: 'active' as const,
      }));

    return this.mergeWardFloors(fromCatalog, fromRooms).sort((a, b) =>
      String(a.label || a.name).localeCompare(String(b.label || b.name))
    );
  }

  private syncPlacementFloors(wardId: string, target: 'room' | 'bed'): void {
    const id = String(wardId || '').trim();
    const applyFloors = (floors: WardFloor[]) => {
      if (id && floors.length) {
        this.upsertWardFloorsForWard(id, floors);
      }

      const resolved = this.resolveFloorsForWard(id);
      if (target === 'room') {
        this.roomFormFloors = resolved;
        this.syncRoomFormFloorSelection();
        return;
      }

      this.bedFormFloors = resolved;
      const currentFloorId = String(this.bedForm.get('floorId')?.value || '');
      const floorStillValid = resolved.some((floor) => String(floor._id) === currentFloorId);
      if (!floorStillValid) {
        this.bedForm.patchValue({ floorId: resolved[0]?._id || '' }, { emitEvent: false });
      }
      this.refreshBedFormRooms();
      this.syncBedFormRoomSelection();
    };

    if (!id) {
      if (target === 'room') {
        this.roomFormFloors = [];
      } else {
        this.bedFormFloors = [];
      }
      return;
    }

    applyFloors(this.resolveFloorsForWard(id));
    this.wardData.fetchWardFloors(id).subscribe({
      next: (floors) => applyFloors(floors),
      error: () => applyFloors(this.resolveFloorsForWard(id)),
    });
  }

  private bindRoomFormWardListener(): void {
    this.unbindRoomFormWardListener();
    this.roomFormWardSub = this.roomForm.get('wardId')?.valueChanges.subscribe((wardId) => {
      this.syncPlacementFloors(String(wardId || ''), 'room');
    });
  }

  private bindBedFormWardListener(): void {
    this.unbindBedFormWardListener();
    this.bedFormWardSub = this.bedForm.get('wardId')?.valueChanges.subscribe((wardId) => {
      this.syncPlacementFloors(String(wardId || ''), 'bed');
    });
  }

  private unbindRoomFormWardListener(): void {
    this.roomFormWardSub?.unsubscribe();
    this.roomFormWardSub = undefined;
  }

  private unbindBedFormWardListener(): void {
    this.bedFormWardSub?.unsubscribe();
    this.bedFormWardSub = undefined;
  }

  private syncRoomFormFloorSelection(): void {
    const floors = this.roomFormFloors;
    const currentFloorId = String(this.roomForm.get('floorId')?.value || '');
    const stillValid = floors.some((floor) => String(floor._id) === currentFloorId);
    if (!stillValid) {
      this.roomForm.patchValue({ floorId: floors[0]?._id || '' }, { emitEvent: false });
    }
  }

  private syncBedFormRoomSelection(): void {
    const rooms = this.bedFormRooms;
    const currentRoomId = String(this.bedForm.get('roomId')?.value || '');
    const stillValid = rooms.some((room) => room.id === currentRoomId);
    if (!stillValid) {
      this.bedForm.patchValue({ roomId: rooms[0]?.id || '' }, { emitEvent: false });
    }
  }

  openChangeStatus(bed: WardBedRecord): void {
    this.selectedBed = bed;
    this.statusForm.reset({
      status: bed.status === 'occupied' ? 'on_hold' : bed.status,
      reason: '',
    });
    this.activeModal = 'status';
  }

  openViewBed(bed: WardBedRecord, forceDetails = false): void {
    if (!forceDetails && bed.status === 'occupied' && bed.admissionId) {
      void this.router.navigate(['/ward/patient-detail', bed.admissionId]);
      return;
    }

    this.selectedBed = bed;
    this.activeModal = 'viewBed';
  }

  roomForBed(bed: WardBedRecord): WardRoomRecord | null {
    return this.rooms.find((room) => room.id === bed.roomId) || null;
  }

  viewBedPatient(bed: WardBedRecord): void {
    if (!bed.admissionId) {
      return;
    }
    void this.router.navigate(['/ward/patient-detail', bed.admissionId]);
  }

  closeModal(): void {
    const closingTransfer = this.activeModal === 'transfer';
    const closingBedDetail = this.activeModal === 'viewBed';
    this.unbindRoomFormWardListener();
    this.unbindBedFormWardListener();
    this.activeModal = null;
    this.selectedBed = null;
    this.statusReason = '';
    this.roomFormFloors = [];
    this.bedFormFloors = [];
    this.bedFormRooms = [];
    this.transferFloors = [];
    this.transferRooms = [];
    this.transferContext = {
      admissionId: '',
      patientName: '',
      currentBedNo: '',
      currentRoomId: '',
      currentBedId: '',
    };
    if (closingTransfer) {
      this.clearTransferQuery();
    }
    if (closingBedDetail) {
      this.clearBedDetailQuery();
    }
  }

  trackFloorById(_index: number, floor: WardFloor): string {
    return floor._id;
  }

  trackRoomById(_index: number, room: WardRoomRecord): string {
    return room.id;
  }

  saveRoom(): void {
    if (this.roomForm.invalid) {
      this.roomForm.markAllAsTouched();
      return;
    }

    const value = this.roomForm.getRawValue();
    if (!this.roomFormFloors.length) {
      this.toastr.error('Add a floor for this ward before creating a room.');
      return;
    }

    const payload = this.wardData.buildRoomPayload({
      roomName: value.roomName,
      roomType: value.roomType,
      wardId: value.wardId,
      floorId: value.floorId,
      dailyCharge: Number(value.dailyCharge),
    });

    if (this.roomModalMode === 'add') {
      this.wardData.createRoom(payload).subscribe({
        next: () => {
          this.toastr.success('Room added successfully.');
          this.closeModal();
          this.loadData();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Failed to create room.'),
      });
      return;
    }

    const room = this.selectedRoom;
    if (!room) {
      return;
    }

    this.wardData.updateRoom(room.id, payload).subscribe({
      next: () => {
        this.toastr.success('Room updated successfully.');
        this.closeModal();
        this.loadData();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Failed to update room.'),
    });
  }

  saveBed(): void {
    if (this.bedForm.invalid) {
      this.bedForm.markAllAsTouched();
      return;
    }

    const value = this.bedForm.getRawValue();
    const room = this.rooms.find((item) => item.id === value.roomId);
    if (!room) {
      this.toastr.error('Select a valid room.');
      return;
    }

    const createPayload: Record<string, unknown> = {
      roomId: value.roomId,
      bedNo: value.bedNo,
      bedType: value.bedType,
      status: value.status,
      dailyCharge: Number(value.dailyCharge),
      notes: value.notes || '',
    };

    const updatePayload: Record<string, unknown> = {
      bedNo: value.bedNo,
      bedType: value.bedType,
      status: value.status,
      dailyCharge: Number(value.dailyCharge),
      notes: value.notes || '',
    };

    const bedId = this.selectedBed?.id || '';
    const shouldCreate =
      this.bedModalMode === 'add' || !isPersistedWardBedId(bedId);

    const request$ = shouldCreate
      ? this.wardData.createWardBed(createPayload)
      : this.wardData.updateWardBed(bedId, updatePayload);

    request$.subscribe({
      next: () => {
        this.toastr.success(
          shouldCreate && this.bedModalMode === 'edit'
            ? 'Bed saved successfully.'
            : this.bedModalMode === 'add'
              ? 'Bed added successfully.'
              : 'Bed updated successfully.'
        );
        this.closeModal();
        this.loadData();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Failed to save bed.'),
    });
  }

  saveBedStatus(): void {
    if (!this.selectedBed || this.statusForm.invalid) {
      this.statusForm.markAllAsTouched();
      return;
    }

    const nextStatus = this.statusForm.get('status')?.value as WardBedStatus;

    if (this.selectedBed.status === 'occupied') {
      this.toastr.error('Occupied beds cannot be changed from this modal.');
      return;
    }

    const statusPayload = {
      status: nextStatus,
      notes: this.statusForm.get('reason')?.value || '',
    };

    const request$ = isPersistedWardBedId(this.selectedBed.id)
      ? this.wardData.updateWardBed(this.selectedBed.id, statusPayload)
      : this.wardData.createWardBed({
          roomId: this.selectedBed.roomId,
          bedNo: this.selectedBed.bedNo,
          bedType: this.selectedBed.bedType,
          status: nextStatus,
          dailyCharge: this.selectedBed.dailyCharge,
          notes: statusPayload.notes,
        });

    request$.subscribe({
      next: () => {
        this.toastr.success('Bed status updated.');
        this.closeModal();
        this.loadData();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Failed to update bed status.'),
    });
  }

  saveTransfer(): void {
    if (this.transferForm.invalid) {
      this.transferForm.markAllAsTouched();
      return;
    }

    const admissionId = this.transferContext.admissionId;
    if (!admissionId) {
      this.toastr.error('No active admission found for transfer.');
      return;
    }

    const value = this.transferForm.getRawValue();
    const selectedBed = this.beds.find((bed) => bed.id === value.bedId);
    const targetRoomId = selectedBed?.roomId || String(value.roomId || '');
    const targetBedId = selectedBed?.id || '';

    if (!targetRoomId) {
      this.toastr.error('Select a target room.');
      return;
    }

    if (targetBedId && targetBedId === this.transferContext.currentBedId) {
      this.toastr.warning('Select a different target bed.');
      return;
    }

    if (!targetBedId && targetRoomId === this.transferContext.currentRoomId) {
      this.toastr.warning('Select a different room or an available target bed.');
      return;
    }

    const payload: Record<string, unknown> = {
      roomId: targetRoomId,
      bedId: isPersistedWardBedId(targetBedId) ? targetBedId : undefined,
      bedLabel: selectedBed?.bedNo || String(value.bedLabel || '').trim() || undefined,
      notes: String(value.notes || '').trim() || undefined,
    };

    this.wardData.transferAdmission(admissionId, payload).subscribe({
      next: () => {
        this.toastr.success('Patient transferred successfully.');
        this.closeModal();
        this.loadData();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Failed to transfer patient.'),
    });
  }

  deleteRoom(): void {
    const room = this.selectedRoom;
    if (!room) {
      return;
    }

    if (room.occupiedBeds > 0) {
      this.toastr.error('This room has occupied beds and cannot be deleted.');
      return;
    }

    this.wardData.deleteRoom(room.id).subscribe({
      next: () => {
        this.toastr.success('Room deleted successfully.');
        this.loadData();
      },
      error: () => this.toastr.error('Failed to delete room.'),
    });
  }

  private buildGalleryOptions(rooms: WardRoomRecord[]): WardGalleryOption[] {
    const galleries = new Map<string, string>();
    rooms.forEach((room) => {
      galleries.set(room.galleryId, room.galleryName);
    });
    return Array.from(galleries.entries()).map(([id, label]) => ({ id, label }));
  }

  assignPatient(bed: WardBedRecord): void {
    void this.router.navigate(['/room-allotment/add-alloted-rooms'], {
      queryParams: {
        bedId: isPersistedWardBedId(bed.id) ? bed.id : undefined,
        roomId: bed.roomId,
        bedNo: bed.bedNo,
        wardName: this.filters.ward || undefined,
      },
    });
  }

  transferPatient(bed: WardBedRecord): void {
    this.openTransferForBed(bed);
  }

  roomTypeLabel(type: WardRoomType): string {
    return this.roomTypeOptions.find((item) => item.value === type)?.label || type;
  }

  bedStatusLabel(status: WardBedStatus): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  bedStatusClass(status: WardBedStatus): string {
    return `bed-badge--${status}`;
  }

  roomCardClass(room: WardRoomRecord): string {
    if (room.id === this.selectedRoom?.id) {
      return 'room-card--selected';
    }

    if (room.maintenanceBeds > 0) {
      return 'room-card--warning';
    }

    if (room.onHoldBeds > 0 || room.cleaningBeds > 0) {
      return 'room-card--amber';
    }

    if (room.availableBeds > room.occupiedBeds) {
      return 'room-card--green';
    }

    return '';
  }

  formatDate(value?: string): string {
    if (!value) {
      return '—';
    }

    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  formatCurrency(value: number): string {
    return `Rs. ${value.toLocaleString('en-PK')}/day`;
  }

  fieldError(form: FormGroup, controlName: string, label: string): string {
    const control = form.get(controlName);
    if (!control || !control.touched || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return `${label} is required.`;
    }

    if (control.errors['min']) {
      return `${label} must be at least ${control.errors['min'].min}.`;
    }

    return `Enter a valid ${label.toLowerCase()}.`;
  }

  isFieldInvalid(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return Boolean(control && control.invalid && control.touched);
  }

  displayValue(value?: string | number): string {
    if (value === undefined || value === null || value === '') {
      return '—';
    }

    return String(value);
  }

  private recalculateRoomCounts(): void {
    this.rooms = this.rooms.map((room) => {
      const roomBeds = this.beds.filter((bed) => bed.roomId === room.id);
      return {
        ...room,
        occupiedBeds: roomBeds.filter((bed) => bed.status === 'occupied').length,
        availableBeds: roomBeds.filter((bed) => bed.status === 'available').length,
        cleaningBeds: roomBeds.filter((bed) => bed.status === 'cleaning').length,
        maintenanceBeds: roomBeds.filter((bed) => bed.status === 'maintenance' || bed.status === 'blocked').length,
        onHoldBeds: roomBeds.filter((bed) => bed.status === 'on_hold').length,
        capacity: Math.max(room.capacity, roomBeds.length),
      };
    });
  }

  private clearTransferQuery(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        admissionId: null,
        patientId: null,
        patientName: null,
        roomId: null,
        bedNo: null,
        wardName: null,
        transferBedId: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private clearBedDetailQuery(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        action: null,
        bedId: null,
        roomId: null,
        bedNo: null,
        patientId: null,
        patientName: null,
        wardName: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
