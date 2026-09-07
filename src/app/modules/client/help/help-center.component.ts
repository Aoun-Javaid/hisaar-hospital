import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { hasPermission, readStoredPermissions } from '../../auth/access-control';
import {
  isClinicalModuleEnabled,
  isHospitalSetupModuleAllowed,
  isLaboratoryModuleEnabled,
  isPharmacyModuleEnabled,
  isWardModuleEnabled,
} from '../../auth/hospital-modules';
import { canAccessHospitalSetup } from '../../auth/hospital-scope';
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  HELP_MODULE_GUIDES,
  HELP_POPULAR_SEARCHES,
  HELP_POPULAR_SEARCH_MODULES,
  HELP_QUICK_TASKS,
  HELP_ROLE_FILTERS,
  HelpArticle,
  HelpModuleGuide,
  HelpQuickTask,
  filterHelpArticlesByRole,
  getHelpArticleBySlug,
  getHelpArticlesByCategory,
  isHelpModuleVisible,
} from './help-content.data';
import {
  HelpRoleKey,
  HelpRoleWorkflowConfig,
  HelpWorkflowBlock,
  HelpWorkflowStep,
} from './help-role-workflows.data';
import {
  filterModuleGuidesForRole,
  filterQuickTasksForRole,
  getRolePreferredGuideSlugs,
  isHelpRoleVisible,
  rankArticlesForRole,
  readStoredHelpRole,
  resolveRoleWorkflow,
  sanitizeHelpRoleKey,
  storeHelpRole,
} from './help-role-workflows.util';
import {
  HelpSearchResult,
  articleNavigationLabel as buildArticleNavigationLabel,
  articleRoleLabel as buildArticleRoleLabel,
  articleSummary as buildArticleSummary,
  highlightSearchText,
  readHelpSearchHistory,
  rememberHelpSearchTerm,
  searchHelpArticles,
} from './help-search.util';

const ROLE_CHIP_LABELS: Record<string, string> = {
  owner: 'Owner / Admin',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  ward: 'Ward Receptionist / Nurse',
  laboratory: 'Laboratory',
  pharmacy: 'Pharmacy',
  accountant: 'Accountant',
};

interface HelpGuideCardView {
  article: HelpArticle;
  summary: string;
  roleLabel: string;
  navigationLabel: string;
  roleChips: string[];
  titleHtml?: SafeHtml;
  summaryHtml?: SafeHtml;
  navigationHtml?: SafeHtml;
}

@Component({
  selector: 'app-help-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './help-center.component.html',
  styleUrl: './help-center.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterComponent implements OnInit, OnDestroy {
  searchQuery = '';
  selectedCategory = '';
  selectedRole: HelpRoleKey = '';
  results: HelpArticle[] = HELP_ARTICLES;
  searchResults: HelpSearchResult[] = [];
  recentSearches: string[] = [];
  activeArticle: HelpArticle | null = null;
  readonly categories = HELP_CATEGORIES;
  readonly roleFilters = HELP_ROLE_FILTERS;
  readonly popularSearches = HELP_POPULAR_SEARCHES;
  readonly quickTasks: HelpQuickTask[] = HELP_QUICK_TASKS;
  readonly moduleGuides: HelpModuleGuide[] = HELP_MODULE_GUIDES;

  visibleRoleFilters: Array<(typeof HELP_ROLE_FILTERS)[number]> = [...HELP_ROLE_FILTERS];
  visiblePopularSearches: string[] = [...HELP_POPULAR_SEARCHES];
  activeWorkflow: HelpRoleWorkflowConfig = resolveRoleWorkflow('', {
    clinical: true,
    pharmacy: true,
    laboratory: true,
    ward: true,
    accounts: true,
    nursery: true,
    setup: true,
  });
  visibleModuleGuides: HelpModuleGuide[] = [];
  visibleQuickTasks: HelpQuickTask[] = [];
  commonTasks: HelpQuickTask[] = [];
  isSearchActive = false;
  guidesHeading = 'All guides';
  displayedResults: HelpArticle[] = HELP_ARTICLES;
  guideCards: HelpGuideCardView[] = [];
  searchGuideCards: HelpGuideCardView[] = [];
  showMobileWorkflow = false;

  private permissions = readStoredPermissions();
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.recentSearches = readHelpSearchHistory();
    this.selectedRole = readStoredHelpRole();
    this.showMobileWorkflow = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false;
    this.refreshResults();

    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      this.activeArticle = slug ? getHelpArticleBySlug(slug) || null : null;
      this.cdr.markForCheck();
    });

    this.route.queryParamMap.subscribe((params) => {
      const articleSlug = params.get('article');
      if (articleSlug) {
        this.activeArticle = getHelpArticleBySlug(articleSlug) || null;
      }

      if (params.has('role')) {
        this.selectedRole = sanitizeHelpRoleKey(params.get('role'));
        storeHelpRole(this.selectedRole);
        this.refreshResults(false);
      }

      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }

  private rebuildViewModel(): void {
    const moduleFlags = this.moduleFlags;
    this.visibleRoleFilters = this.roleFilters.filter((role) =>
      isHelpRoleVisible(role.key as HelpRoleKey, moduleFlags)
    );
    this.visiblePopularSearches = this.popularSearches.filter((term) => {
      const moduleKey = HELP_POPULAR_SEARCH_MODULES[term];
      return !moduleKey || isHelpModuleVisible(moduleKey, moduleFlags);
    });
    this.activeWorkflow = resolveRoleWorkflow(this.selectedRole, moduleFlags);
    const visibleModuleGuides = this.moduleGuides.filter(
      (guide) => isHelpModuleVisible(guide.module, moduleFlags) && this.canAccessModuleGuide(guide)
    );
    this.visibleModuleGuides = filterModuleGuidesForRole(visibleModuleGuides, this.selectedRole, () => true);
    this.visibleQuickTasks = filterQuickTasksForRole(this.quickTasks, this.selectedRole, (task) => {
      const article = getHelpArticleBySlug(task.slug);
      if (!article) return true;
      return (
        isHelpModuleVisible(article.module, moduleFlags) &&
        filterHelpArticlesByRole([article], this.selectedRole).length > 0
      );
    });
    const commonSlugs = new Set(this.activeWorkflow.commonTaskSlugs);
    this.commonTasks = this.visibleQuickTasks.filter((task) => commonSlugs.has(task.slug)).slice(0, 5);
    this.isSearchActive = Boolean(this.searchQuery.trim());
    this.guidesHeading = this.isSearchActive ? 'Search results' : this.selectedCategory ? this.selectedCategory : 'All guides';
    this.displayedResults = this.isSearchActive ? this.searchResults.map((item) => item.article) : this.results;
    this.guideCards = this.results.map((article) => this.buildGuideCard(article));
    this.searchGuideCards = this.displayedResults.map((article) => this.buildGuideCard(article, true));
  }

  private buildGuideCard(article: HelpArticle, withHighlight = false): HelpGuideCardView {
    const card: HelpGuideCardView = {
      article,
      summary: buildArticleSummary(article),
      roleLabel: buildArticleRoleLabel(article),
      navigationLabel: buildArticleNavigationLabel(article),
      roleChips: this.buildRoleChips(article),
    };
    if (withHighlight && this.searchQuery.trim()) {
      card.titleHtml = this.sanitizer.bypassSecurityTrustHtml(highlightSearchText(article.title, this.searchQuery));
      card.summaryHtml = this.sanitizer.bypassSecurityTrustHtml(highlightSearchText(card.summary, this.searchQuery));
      if (card.navigationLabel) {
        card.navigationHtml = this.sanitizer.bypassSecurityTrustHtml(
          highlightSearchText(card.navigationLabel, this.searchQuery)
        );
      }
    }
    return card;
  }

  private buildRoleChips(article: HelpArticle): string[] {
    if (article.roles?.length) {
      return article.roles.map((role) => ROLE_CHIP_LABELS[role] || role);
    }
    return article.whoCan
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  private get moduleFlags() {
    return {
      clinical: isClinicalModuleEnabled(),
      pharmacy: isPharmacyModuleEnabled(),
      laboratory: isLaboratoryModuleEnabled(),
      ward: isWardModuleEnabled(),
      accounts: this.hasAccountsAccess,
      nursery: isWardModuleEnabled(),
      setup: isHospitalSetupModuleAllowed() && (canAccessHospitalSetup() || this.hasWildcard),
    };
  }

  private get hasAccountsAccess(): boolean {
    return (
      this.hasWildcard ||
      hasPermission('accounts.read', this.permissions) ||
      hasPermission('accounts.reports.read', this.permissions) ||
      hasPermission('ledger_payments.read', this.permissions)
    );
  }

  private get hasWildcard(): boolean {
    return this.permissions.includes('*');
  }

  private canAccessModuleGuide(guide: HelpModuleGuide): boolean {
    switch (guide.module) {
      case 'clinical':
        return (
          this.hasWildcard ||
          hasPermission('appointments.read', this.permissions) ||
          hasPermission('prescriptions.read', this.permissions) ||
          hasPermission('patients.read', this.permissions)
        );
      case 'ward':
        return this.hasWildcard || hasPermission('ward.read', this.permissions);
      case 'laboratory':
        return this.hasWildcard || hasPermission('lab_orders.read', this.permissions);
      case 'pharmacy':
        return this.hasWildcard || hasPermission('products.read', this.permissions);
      case 'accounts':
        return this.hasAccountsAccess;
      case 'nursery':
        return this.hasWildcard || hasPermission('nursery.read', this.permissions) || hasPermission('ward.read', this.permissions);
      case 'setup':
        return canAccessHospitalSetup() || this.hasWildcard || hasPermission('roles.read', this.permissions);
      default:
        return true;
    }
  }

  isWorkflowBlock(block: HelpWorkflowBlock): block is Extract<HelpWorkflowBlock, { type: 'row' | 'branch' | 'parallel' }> {
    return block.type === 'row' || block.type === 'branch' || block.type === 'parallel';
  }

  onSearchInputChange(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.refreshResults(false);
      this.cdr.markForCheck();
    }, 250);
  }

  onSearch(commitHistory = true): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.selectedCategory = '';
    this.refreshResults(commitHistory);
    this.cdr.markForCheck();
  }

  applyPopularSearch(term: string): void {
    this.searchQuery = term;
    this.onSearch(true);
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.searchQuery = '';
    this.searchResults = [];
    this.refreshResults(false);
    this.cdr.markForCheck();
  }

  selectRole(roleKey: HelpRoleKey): void {
    this.selectedRole = sanitizeHelpRoleKey(roleKey);
    storeHelpRole(this.selectedRole);
    this.refreshResults(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { role: this.selectedRole || null },
      queryParamsHandling: 'merge',
    });
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.selectedRole = '';
    this.searchResults = [];
    storeHelpRole('');
    this.refreshResults(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { role: null },
      queryParamsHandling: 'merge',
    });
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.refreshResults(false);
    this.cdr.markForCheck();
  }

  openArticle(article: HelpArticle): void {
    if (this.searchQuery.trim()) {
      this.recentSearches = rememberHelpSearchTerm(this.searchQuery);
    }
    void this.router.navigate(['/help', article.slug], {
      queryParams: { role: this.selectedRole || null },
      queryParamsHandling: 'merge',
    });
  }

  openQuickTask(task: HelpQuickTask): void {
    void this.router.navigate(['/help', task.slug], {
      queryParams: { role: this.selectedRole || null },
      queryParamsHandling: 'merge',
    });
  }

  openWorkflowStep(step: HelpWorkflowStep): void {
    if (!step.helpSlug) return;
    this.openQuickTask({ label: step.label, slug: step.helpSlug, icon: 'fa-book' });
  }

  openModuleGuide(guide: HelpModuleGuide): void {
    if (guide.slug) {
      void this.router.navigate(['/help', guide.slug], {
        queryParams: { role: this.selectedRole || null },
        queryParamsHandling: 'merge',
      });
      return;
    }
    this.activeArticle = null;
    this.selectCategory(guide.category);
    void this.router.navigate(['/help'], {
      queryParams: { role: this.selectedRole || null },
      queryParamsHandling: 'merge',
    });
  }

  backToHome(): void {
    this.activeArticle = null;
    void this.router.navigate(['/help'], {
      queryParams: { role: this.selectedRole || null },
      queryParamsHandling: 'merge',
    });
  }

  relatedArticles(article: HelpArticle): HelpArticle[] {
    return article.related
      .map((slug) => getHelpArticleBySlug(slug))
      .filter((item): item is HelpArticle => Boolean(item))
      .filter((item) => isHelpModuleVisible(item.module, this.moduleFlags));
  }

  articleSummary(article: HelpArticle): string {
    return buildArticleSummary(article);
  }

  articleRoleLabel(article: HelpArticle): string {
    return buildArticleRoleLabel(article);
  }

  articleNavigationLabel(article: HelpArticle): string {
    return buildArticleNavigationLabel(article);
  }

  roleChips(article: HelpArticle): string[] {
    if (article.roles?.length) {
      return article.roles.map((role) => ROLE_CHIP_LABELS[role] || role);
    }
    return article.whoCan
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  navigationPath(article: HelpArticle): string[] {
    if (article.navigationPath?.length) return article.navigationPath;
    if (article.route) {
      return article.route
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.replace(/-/g, ' '));
    }
    return [];
  }

  highlight(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(highlightSearchText(text, this.searchQuery));
  }

  private refreshResults(commitHistory = false): void {
    const trimmed = this.searchQuery.trim();
    const preferredGuideSlugs = getRolePreferredGuideSlugs(this.selectedRole);

    if (trimmed) {
      this.searchResults = searchHelpArticles(HELP_ARTICLES, trimmed, {
        roleKey: this.selectedRole,
        moduleFlags: this.moduleFlags,
        preferredGuideSlugs,
      });
      this.results = this.searchResults.map((item) => item.article);
      if (commitHistory) {
        this.recentSearches = rememberHelpSearchTerm(trimmed);
      }
      this.rebuildViewModel();
      return;
    }

    this.searchResults = [];
    if (this.selectedCategory) {
      this.results = getHelpArticlesByCategory(this.selectedCategory);
    } else {
      this.results = HELP_ARTICLES;
    }

    this.results = filterHelpArticlesByRole(this.results, this.selectedRole);
    this.results = this.results.filter((article) => isHelpModuleVisible(article.module, this.moduleFlags));
    this.results = rankArticlesForRole(this.results, this.selectedRole);
    this.rebuildViewModel();
  }
}
