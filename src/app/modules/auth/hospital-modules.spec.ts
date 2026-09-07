import {
  filterPermissionsByHospitalModules,
  isHospitalPatientsModuleAllowed,
  isHospitalSetupModuleAllowed,
  isPharmacyWardIntegrationAllowed,
  isRoleAllowedByHospitalModules,
  resolveBlockedModuleForRoute,
  resolveRoleModuleKey,
} from './hospital-modules';

describe('hospital-modules surface gating', () => {
  const setModules = (modules: {
    pharmacy?: boolean;
    laboratory?: boolean;
    ward?: boolean;
    clinical?: boolean;
  }) => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        hospital: {
          modulesEnforced: true,
          enabledModules: {
            pharmacy: false,
            laboratory: false,
            ward: false,
            clinical: false,
            ...modules,
          },
        },
      })
    );
  };

  afterEach(() => {
    localStorage.removeItem('user');
  });

  it('hides hospital setup for pharmacy-only', () => {
    setModules({ pharmacy: true });
    expect(isHospitalSetupModuleAllowed()).toBeFalse();
    expect(resolveBlockedModuleForRoute('/hospital-setup')).toBe('clinical');
  });

  it('allows hospital setup when clinical or ward is on', () => {
    setModules({ clinical: true });
    expect(isHospitalSetupModuleAllowed()).toBeTrue();
    expect(resolveBlockedModuleForRoute('/hospital-setup')).toBeNull();

    setModules({ ward: true });
    expect(isHospitalSetupModuleAllowed()).toBeTrue();
  });

  it('hides hospital patients/billing for pharmacy-only', () => {
    setModules({ pharmacy: true });
    expect(isHospitalPatientsModuleAllowed()).toBeFalse();
    expect(resolveBlockedModuleForRoute('/patients/all-patients')).toBe('clinical');
    expect(resolveBlockedModuleForRoute('/payments')).toBe('clinical');
  });

  it('allows patients for laboratory-only', () => {
    setModules({ laboratory: true });
    expect(isHospitalPatientsModuleAllowed()).toBeTrue();
    expect(isHospitalSetupModuleAllowed()).toBeFalse();
  });

  it('requires ward module for pharmacy ward settlements', () => {
    setModules({ pharmacy: true });
    expect(isPharmacyWardIntegrationAllowed()).toBeFalse();

    setModules({ pharmacy: true, ward: true });
    expect(isPharmacyWardIntegrationAllowed()).toBeTrue();
  });
});

describe('resolveRoleModuleKey / role visibility', () => {
  const setModules = (modules: {
    pharmacy?: boolean;
    laboratory?: boolean;
    ward?: boolean;
    clinical?: boolean;
  }) => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        hospital: {
          modulesEnforced: true,
          enabledModules: {
            pharmacy: false,
            laboratory: false,
            ward: false,
            clinical: false,
            ...modules,
          },
        },
      })
    );
  };

  afterEach(() => {
    localStorage.removeItem('user');
  });

  it('maps Ward Receptionist to ward and hides on pharmacy-only', () => {
    expect(resolveRoleModuleKey({ name: 'Ward Receptionist' })).toBe('ward');
    setModules({ pharmacy: true });
    expect(isRoleAllowedByHospitalModules({ name: 'Ward Receptionist' })).toBeFalse();
  });

  it('maps lab roles and hides them on pharmacy-only', () => {
    expect(resolveRoleModuleKey({ name: 'Lab Receptionist' })).toBe('laboratory');
    expect(resolveRoleModuleKey({ name: 'Lab Technician' })).toBe('laboratory');
    expect(resolveRoleModuleKey({ name: 'Pathologist' })).toBe('laboratory');
    expect(resolveRoleModuleKey({ name: 'Laboratory Admin' })).toBe('laboratory');
    setModules({ pharmacy: true });
    expect(isRoleAllowedByHospitalModules({ name: 'Lab Receptionist' })).toBeFalse();
  });

  it('shows lab roles on laboratory-only and hides pharmacy/ward/clinical', () => {
    setModules({ laboratory: true });
    expect(isRoleAllowedByHospitalModules({ name: 'Lab Receptionist' })).toBeTrue();
    expect(isRoleAllowedByHospitalModules({ name: 'Pathologist' })).toBeTrue();
    expect(isRoleAllowedByHospitalModules({ name: 'Pharmacy' })).toBeFalse();
    expect(isRoleAllowedByHospitalModules({ name: 'Ward Receptionist' })).toBeFalse();
    expect(isRoleAllowedByHospitalModules({ name: 'Doctor' })).toBeFalse();
    expect(isRoleAllowedByHospitalModules({ name: 'Receptionist' })).toBeFalse();
  });

  it('keeps Accountant visible on pharmacy and lab scopes', () => {
    expect(resolveRoleModuleKey({ name: 'Accountant' })).toBeNull();
    setModules({ pharmacy: true });
    expect(isRoleAllowedByHospitalModules({ name: 'Accountant' })).toBeTrue();
    setModules({ laboratory: true });
    expect(isRoleAllowedByHospitalModules({ name: 'Accountant' })).toBeTrue();
  });
});

describe('filterPermissionsByHospitalModules', () => {
  const setModules = (modules: {
    pharmacy?: boolean;
    laboratory?: boolean;
    ward?: boolean;
    clinical?: boolean;
  }) => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        hospital: {
          modulesEnforced: true,
          enabledModules: {
            pharmacy: false,
            laboratory: false,
            ward: false,
            clinical: false,
            ...modules,
          },
        },
      })
    );
  };

  afterEach(() => {
    localStorage.removeItem('user');
  });

  it('clips clinical/ward/lab perms on pharmacy-only', () => {
    setModules({ pharmacy: true });
    const filtered = filterPermissionsByHospitalModules([
      'products.read',
      'doctors.read',
      'ward.read',
      'lab_orders.read',
      'users.read',
    ]);
    expect(filtered).toEqual(['products.read', 'users.read']);
  });
});
