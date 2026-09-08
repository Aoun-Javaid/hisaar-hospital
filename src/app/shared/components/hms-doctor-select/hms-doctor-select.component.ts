import { CommonModule } from '@angular/common';
import { Component, EventEmitter, forwardRef, HostBinding, Input, Output } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { initialsFromName, resolveAssetUrl } from '../../../core/utils/asset.util';
import { Doctor } from '../../../shared/models/hospital.model';
import { doctorDisplayName, doctorProfileLine } from '../../../modules/client/prescription/admission-recommendation.models';

@Component({
  selector: 'hms-doctor-select',
  imports: [CommonModule, FormsModule],
  templateUrl: './hms-doctor-select.component.html',
  styleUrl: './hms-doctor-select.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => HmsDoctorSelectComponent),
      multi: true,
    },
  ],
})
export class HmsDoctorSelectComponent implements ControlValueAccessor {
  @Input() doctors: Doctor[] = [];
  @Input() previewDoctor: Doctor | null = null;
  @Input() label = 'Consultant Doctor';
  @Input() required = false;
  @Input() disabled = false;
  @Input() loading = false;
  @Input() placeholder = 'Select consultant doctor';
  @Input() testId = 'hms-doctor-select';
  @Output() doctorChange = new EventEmitter<Doctor | null>();

  @HostBinding('attr.data-testid')
  get hostTestId(): string {
    return this.testId;
  }

  open = false;
  search = '';
  value = '';

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value = String(value || '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  selectedDoctor(): Doctor | null {
    const doctorId = String(this.value || '').trim();
    if (!doctorId) {
      return this.previewDoctor;
    }

    return (
      this.doctors.find((doctor) => doctor._id === doctorId) ||
      (this.previewDoctor?._id === doctorId ? this.previewDoctor : null) ||
      null
    );
  }

  filteredDoctors(): Doctor[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return this.doctors;
    return this.doctors.filter((doctor) => {
      const haystack = [
        doctorDisplayName(doctor),
        doctor.qualification,
        doctor.specialization,
        doctor.department?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }

  togglePanel(event: Event): void {
    event.stopPropagation();
    if (this.disabled || this.loading) return;
    this.open = !this.open;
    if (this.open) {
      this.search = '';
    }
    this.onTouched();
  }

  closePanel(): void {
    this.open = false;
    this.search = '';
  }

  selectDoctor(doctor: Doctor, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.disabled || this.loading) return;
    this.value = String(doctor._id || '');
    this.onChange(this.value);
    this.onTouched();
    this.doctorChange.emit(doctor);
    this.closePanel();
  }

  displayName(doctor?: Doctor | null): string {
    return doctorDisplayName(doctor);
  }

  profileLine(doctor?: Doctor | null): string {
    return doctorProfileLine(doctor);
  }

  photoUrl(doctor?: Doctor | null): string {
    return resolveAssetUrl((doctor || this.selectedDoctor())?.photoUrl);
  }

  initials(doctor?: Doctor | null): string {
    return initialsFromName(this.displayName(doctor));
  }
}
