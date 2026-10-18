const names = (value: string) => value.split(' ');

export const root = {
  tier1: {
    values: names(
      'useField FieldContext useFieldPath FieldPathContext useForm useFormFields useAllFormFields useWatchForm useFormModified useFormProcessing useFormBackgroundProcessing useFormInitializing useFormSubmitted useDocumentForm Form fieldReducer RenderFields RowLabelProvider useRowLabel withCondition WatchCondition WatchChildErrors NullifyLocaleField useDocumentInfo DocumentInfoProvider useDocumentEvents DocumentEventsProvider useDocumentTitle useEditDepth EditDepthProvider useOperation OperationProvider useConfig ConfigProvider PageConfigProvider useAuth AuthProvider useLocale LocaleProvider useTranslation TranslationProvider useTheme ThemeProvider defaultTheme useModal useServerFunctions ServerFunctionsProvider ServerFunctionsContext usePreferences PreferencesProvider useParams useSearchParams useListQuery ListQueryProvider useSelection SelectionProvider useTableColumns TableColumnsProvider useCellProps useRouteCache RouteCacheProvider useRouteTransition RouteTransitionProvider useStepNav SetStepNav SetDocumentTitle SetDocumentStepNav useNav NavProvider NavContext useActions ActionsProvider useClientFunctions useAddClientFunction ClientFunctionProvider useEntityVisibility EntityVisibilityProvider useScrollInfo ScrollInfoProvider useWindowInfo WindowInfoProvider useUploadEdits UploadEditsProvider useUploadControls useUploadHandlers UploadHandlersProvider useLivePreviewContext LivePreviewProvider useListRelationships RelationshipProvider usePayloadAPI useUseTitleField useDocumentDrawer useDocumentDrawerContext useListDrawer useListDrawerContext ListDrawerContextProvider useBulkUpload BulkUploadProvider useDrawerSlug formatDrawerSlug Translation RenderCustomComponent toast parseSearchParams formatTimeToNow escapeDiffHTML getHTMLDiffComponents unescapeDiffHTML useRouter usePathname PayloadLink useBulkUploadModalSlug useHierarchy HierarchyProvider useDocumentSelection DocumentSelectionProvider useFormErrorHandler FormErrorHandlerContext',
    ),
    types: names(
      'FieldType Options FormProps FieldAction RowLabelProps DocumentInfoContext DocumentInfoProps UseDocumentDrawer DocumentDrawerProps DocumentTogglerProps UseListDrawer ListDrawerProps ListTogglerProps StepNavItem Theme UserWithToken ServerFunctionsContextType RenderDocumentResult RenderDocumentServerFunction RenderFieldServerFnArgs RenderFieldServerFnReturnType RenderListServerFnArgs RenderListServerFnReturnType UploadHandlersContext BulkUploadProps DocumentTitleContext',
    ),
  },
  tier2: {
    values: names(
      'ArrayField BlocksField CheckboxField CodeField CollapsibleField DateTimeField EmailField GroupField HiddenField JSONField JoinField NumberField PointField RadioGroupField RelationshipField RichTextField RowField SelectField TabsField TextField TextareaField UIField UploadField ConfirmPasswordField PasswordField SlugField CheckboxInput RelationshipInput SelectInput TextInput TextareaInput UploadInput FieldLabel FieldError FieldDescription FieldDiffLabel FieldDiffContainer RowLabel TabComponent TabsProvider fieldComponents allFieldComponents fieldBaseClass isFieldRTL DefaultCell RenderDefaultCell DateCell DefaultListView DefaultEditView BlocksDrawer BlockSelector SectionTitle ItemsDrawer CollectionQuerySortField RecentlyViewedCollectionsField UploadDropzoneCollectionsField QueryPresetsHeading LLMInstructionsDescription LLMInstructionsMenuItem NullField TagIcon FolderIcon QueryPresetsAccessCell QueryPresetsColumnField QueryPresetsColumnsCell QueryPresetsGroupByCell QueryPresetsGroupByField QueryPresetsWhereCell QueryPresetsWhereField',
    ),
    types: names('TextInputProps TextAreaInputProps UploadInputProps'),
  },
  excluded: {
    values: names(
      'useDebounce useDebouncedCallback useDebouncedEffect useDelay useDelayedRender useHotkey useIntersect useResize useThrottledEffect useEffectEvent useQueue SortHeader SortRow OrderableTable ConfirmationModal Link LeaveWithoutSaving DocumentTakeOver DocumentLocked DatePicker ViewDescription AppHeader DrawerContentContainer Banner Button AnimateHeight PillSelector Card Collapsible useCollapsible CopyLocaleData CopyToClipboard DeleteMany DocumentControls Dropzone documentDrawerBaseClass useClickOutside useClickOutsideContext useDraggableSortable DraggableSortable DraggableSortableItem DocumentFields Drawer DrawerToggler EditMany ErrorPill FullscreenModal GenerateConfirmation Gutter HydrateAuthProvider Locked ListControls ListSelection ListHeader GroupByHeader PageControls PageControlsComponent GroupByPageControls LoadingOverlayToggle FormLoadingOverlayToggle LoadingOverlay Spinner Logout Modal NavGroup Pagination PerPage Pill PopupList Popup Combobox PublishMany PublishButton SaveButton SaveDraftButton UnpublishButton ReactSelect Select RenderTitle ShimmerEffect StaggeredShimmers SortColumn Table Thumbnail Tooltip UnpublishMany Upload EditUpload FileDetails PreviewSizes PreviewButton RelationshipTable TimezonePicker CodeEditorLazy CodeEditor FormSubmit Account PayloadIcon DefaultBlockImage File CalendarIcon CheckIcon ChevronIcon CloseMenuIcon CodeBlockIcon CopyIcon DragHandleIcon EditIcon LineIcon LinkIcon LogOutIcon MinimizeMaximizeIcon MoreIcon PlusIcon SearchIcon SwapIcon XIcon GearIcon DocumentIcon MoveFolderIcon GridViewIcon ListViewIcon ErrorIcon InfoIcon SuccessIcon WarningIcon ProgressBar useControllableState TextCondition SelectCondition RelationshipCondition NumberCondition DateCondition EmailAndUsernameFields SelectAll SelectRow SelectMany LivePreviewWindow SidebarTabsProvider useSidebarTabs CollectionCardsClient UploadDropzoneWidgetClient DialogBody DialogCancel DialogConfirm DialogFooter DialogHeader DialogModal DocumentStaleData StatusCell TableSection MenuSeparator BulkUploadModal APIKeyInput TabButton Tabs TabsList CardGrid Chip DocumentCard LayoutToggle SidebarRow HierarchySidebarTab DocumentHeaderRoot SidebarToggle HydrateHierarchyProvider HydratePreferences IDLabel InputStepper ListControlsBar HierarchyButtonClient HierarchyFieldClient formatHierarchyModalSlug HierarchyModalToggler useHierarchyModal SegmentedControl Switch DelayedSpinner NavSidebarToggle NavWrapper SettingsMenuButton DefaultNavClient SidebarTabsClient TabError ShouldRenderTabs DocumentTabLink VersionsPill DefaultTemplateWrapper FormHeader HierarchyTypeField NoListResults SimplePagination CommandPalette commandPaletteSlug ThumbnailCard FieldErrorsToast UserMenu ListSearchFilter SearchInput FilterTrigger formatOptions mergeFieldStyles ClockIcon AlignJustifiedIcon NewTabIcon PinIcon FilterIcon RecentsAndPinnedClient TableIcon WriteIcon ArrowIcon CirclePlusIcon CircledXIcon ClipboardIcon Dots DuplicateIcon EyeIcon KeyIcon LockIcon LockOpenIcon PeopleIcon RefreshIcon ReplaceIcon SortDownIcon SortUpIcon SpinnerIcon ThreeDotsIcon TrashIcon InteractionEnterIcon LanguageIcon VariableColorIcon WarningTriangleIcon AuthSessionDebug RootProviders RouterAdapterContext EmbedProvider useEmbed HierarchyListView AccountClient AccountResetPreferences AccountLanguageSelector AccountToggleHighContrast AccountToggleTheme APIViewClient CreateFirstUserClient ModularDashboardClient ForgotPasswordForm LoginForm LogoutClient NotFoundClient ResetPasswordForm ToastAndRedirect VerifyClient DefaultVersionView VersionsViewClient VersionPillLabel RenderVersionFieldsToDiff VersionFieldDiffCheckbox VersionFieldDiffCollapsible VersionFieldDiffDate VersionFieldDiffGroup VersionFieldDiffIterable VersionFieldDiffRow VersionFieldDiffSelect VersionFieldDiffTabs VersionFieldDiffText VersionsAutosaveCell VersionsCreatedAtCell VersionsIDCell VersionDrawerCreatedAtCell DocumentRoot',
    ),
    types: names(
      'OnCancel SelectablePill SpinnerProps ComboboxEntry ComboboxProps ReactSelectOption ListHeaderProps SidebarTabsContextType DialogBodyProps DialogCancelProps DialogConfirmProps DialogFooterProps DialogHeaderProps DialogModalProps DialogSize TableSectionContentProps TableSectionHeaderProps TableSectionProps APIKeyInputProps TabsProps TabsTab CardGridProps ChipProps DocumentCardProps DocumentCardThumbnail DocumentLayout LayoutToggleProps SidebarRowProps InputStepperProps ListControlsBarProps HierarchyButtonClientProps HierarchyFieldClientProps HierarchyDrawerProps HierarchyDrawerTogglerProps HierarchyModalProps HierarchyModalTogglerProps SelectionWithPath UseHierarchyModal UseHierarchyModalArgs SegmentedControlOptionProps SegmentedControlRootProps SwitchProps DelayedSpinnerProps SettingsMenuButtonProps SidebarTabsClientProps TabMetadata SimplePaginationProps ReactSelectAdapterProps ThumbnailCardProps AuthSession RootProviderProps RouterAdapterContextValue CollectionData DocumentSelectionContextValue SelectableDocument AllowedCollection ThemeContext EmbedContext DocumentRootProps RootLayoutFont',
    ),
  },
};

export const shared = {
  included: {
    values: names(
      'Translation withMergedProps WithServerSideProps mergeFieldStyles reduceToSerializableFields filterFields getInitialColumns abortAndIgnore handleAbortRef requests findLocaleFromCode formatDate formatDocTitle handleBackToDashboard handleGoBack hasSavePermission isClientUserObject isEditing sanitizeID traverseForLocalizedFields',
    ),
    types: [],
  },
  excluded: {
    values: names(
      'PayloadIcon PayloadLogo getGlobalData getNavGroups getVisibleEntities groupNavItems handleTakeOver getViewportContent getViewportMeta isIPhoneUserAgent',
    ),
    types: names('EntityToGroup NavGroupType'),
  },
};

export const rsc = {
  included: {
    values: names(
      'FieldDiffContainer FieldDiffLabel escapeDiffHTML getHTMLDiffComponents unescapeDiffHTML getColumns renderFilters renderTable resolveFilterOptions upsertPreferences handlePreview handleLivePreview copyDataFromLocaleHandler CollectionCards CollectionQueryWidget HierarchyButton HierarchyField HierarchySidebarTabServer HierarchyTypeFieldServer LLMInstructionsCell RecentlyViewedWidget UploadDropzoneWidget WelcomeWidget DefaultTemplate',
    ),
    types: names('DefaultTemplateProps'),
  },
  excluded: {
    values: names(
      '_internal_renderFieldHandler File CheckIcon DocumentHeader FormHeader Logo getNavPrefs DefaultNav renderTabHandler MinimalTemplate getPreferences addRecentlyViewedItem recentlyViewedMaxItems',
    ),
    types: names('NavProps RenderTabServerFnArgs RenderTabServerFnReturnType MinimalTemplateProps'),
  },
};

export const collisions = names(
  'Button Card Collapsible Select ShimmerEffect StaggeredShimmers Tooltip useHotkey',
);

export const adminOverrides = {
  client: names('DefaultListView'),
  rsc: names('DefaultTemplate DefaultTemplateProps'),
};
