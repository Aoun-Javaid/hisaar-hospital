import { HELP_ARTICLES } from './help-content.data';
import {
  highlightSearchText,
  rememberHelpSearchTerm,
  searchHelpArticles,
} from './help-search.util';

describe('help-search.util', () => {
  const allFlags = {
    clinical: true,
    pharmacy: true,
    laboratory: true,
    ward: true,
    accounts: true,
    nursery: true,
    setup: true,
  };

  function topSlug(query: string, roleKey = ''): string {
    return searchHelpArticles(HELP_ARTICLES, query, { roleKey, moduleFlags: allFlags })[0]?.article.slug || '';
  }

  it('ranks admit patient to ward admission guide', () => {
    expect(topSlug('admit patient')).toBe('how-to-admit-patient');
  });

  it('supports Roman Urdu admission phrasing', () => {
    expect(topSlug('patient admit kaise karein')).toBe('how-to-admit-patient');
    expect(topSlug('doctor ne admit forward kiya')).toBe('how-to-admit-patient');
  });

  it('finds appointment and doctor guides', () => {
    expect(topSlug('appointment create')).toBe('how-to-create-appointment');
    expect(topSlug('doctor add')).toBe('add-doctor-guide');
  });

  it('finds MAR and medicine dose guides', () => {
    expect(topSlug('medicine dose')).toBe('mar-medicine-guide');
    expect(topSlug('medicine kab deni hai')).toBe('mar-medicine-guide');
    expect(topSlug('MAR')).toBe('mar-medicine-guide');
  });

  it('finds lab and imaging guides', () => {
    expect(topSlug('lab test')).toBe('lab-order-from-ward');
    expect(topSlug('xray')).toBe('radiology-imaging-guide');
    expect(topSlug('x-ray')).toBe('radiology-imaging-guide');
    expect(topSlug('scan')).toBe('radiology-imaging-guide');
  });

  it('finds pharmacy, payment, discharge, and history guides', () => {
    expect(topSlug('pharmacy sale')).toBe('pharmacy-pos-sale');
    expect(topSlug('medicine issue')).toBe('pharmacy-ward-medicine');
    expect(topSlug('payment')).toBe('receive-patient-payment');
    expect(topSlug('previous admission')).toBe('admission-history-guide');
  });

  it('finds birth certificate guides from baby certificate wording', () => {
    expect(topSlug('baby certificate')).toBe('birth-certificate-issue');
    expect(topSlug('qr verify')).toBe('birth-certificate-issue');
  });

  it('finds accounts rules guide for non-accountant wording', () => {
    expect(topSlug('accounts rules')).toBe('accounts-rules-guide');
    expect(topSlug('debit credit')).toBe('accounts-rules-guide');
    expect(topSlug('cash book payment 0')).toBe('accounts-rules-guide');
  });

  it('hides accounts and nursery guides when those modules are off', () => {
    const results = searchHelpArticles(HELP_ARTICLES, 'accounts rules', {
      moduleFlags: { ...allFlags, accounts: false },
    });
    expect(results.some((item) => item.article.module === 'accounts')).toBeFalse();

    const birth = searchHelpArticles(HELP_ARTICLES, 'birth certificate', {
      moduleFlags: { ...allFlags, nursery: false, ward: false },
    });
    expect(birth.some((item) => item.article.module === 'nursery')).toBeFalse();
  });

  it('is case-insensitive and supports partial words', () => {
    expect(topSlug('ADMIT PATIENT')).toBe('how-to-admit-patient');
    expect(topSlug('appoint')).toBe('how-to-create-appointment');
    expect(topSlug('patient ledger')).toBe('patient-ledger-payments');
  });

  it('boosts role-relevant guides when role filter is active', () => {
    const wardResults = searchHelpArticles(HELP_ARTICLES, 'admission', {
      roleKey: 'ward',
      moduleFlags: allFlags,
      preferredGuideSlugs: ['how-to-admit-patient'],
    });
    expect(wardResults[0]?.article.slug).toBe('how-to-admit-patient');
  });

  it('hides module-gated guides when module disabled', () => {
    const results = searchHelpArticles(HELP_ARTICLES, 'lab test', {
      moduleFlags: { ...allFlags, laboratory: false },
    });
    expect(results.some((item) => item.article.module === 'laboratory')).toBeFalse();
  });

  it('finds duty roster guides including Roman Urdu', () => {
    expect(topSlug('duty roster')).toBe('how-to-create-duty-roster');
    expect(topSlug('nurse ki duty kaise lagaye')).toBe('assign-nurse-duty');
    expect(topSlug('night shift')).toBe('how-to-create-duty-roster');
    expect(topSlug('who is on duty')).toBe('my-duty-roster');
    expect(topSlug('bulk assign roster')).toBe('bulk-assign-duty');
    expect(topSlug('multiple staff duty')).toBe('bulk-assign-duty');
    expect(topSlug('nurse ki duty lagani hai')).toBe('assign-nurse-duty');
    expect(topSlug('publish roster')).toBe('publish-duty-roster');
    expect(topSlug('bulk assign')).toBe('bulk-assign-duty');
    expect(topSlug('bulk medicine')).toBe('bulk-add-medicines');
    expect(topSlug('excel medicine')).toBe('bulk-add-medicines');
    expect(topSlug('medicine import')).toBe('bulk-add-medicines');
  });

  it('boosts duty roster for ward role', () => {
    expect(topSlug('duty roster', 'ward')).toBe('how-to-create-duty-roster');
  });

  it('highlights matched phrases safely', () => {
    const html = highlightSearchText('How to Admit a Patient', 'admit');
    expect(html).toContain('<mark class="help-search-mark">Admit</mark>');
    expect(html).not.toContain('<script');
  });

  it('stores recent searches without duplicates', () => {
    spyOn(localStorage, 'setItem').and.callThrough();
    rememberHelpSearchTerm('admit patient');
    rememberHelpSearchTerm('payment');
    rememberHelpSearchTerm('admit patient');
    const stored = JSON.parse(localStorage.getItem('hms-help-search-history') || '[]') as string[];
    expect(stored[0]).toBe('admit patient');
    expect(stored.filter((item) => item === 'admit patient').length).toBe(1);
  });
});
