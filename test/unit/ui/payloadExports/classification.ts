const names = (value: string) => value.split(' ');

export const root = {
  tier1: {
    values: names(
      'useField FieldContext useFieldPath FieldPathContext useForm useFormFields useAllFormFields useWatchForm useFormModified useFormProcessing useFormBackgroundProcessing useFormInitializing useFormSubmitted useDocumentForm Form fieldReducer RenderFields RowLabelProvider useRowLabel withCondition WatchCondition WatchChildErrors NullifyLocaleField useDocumentInfo DocumentInfoProvider useDocumentEvents DocumentEventsProvider useDocumentTitle useEditDepth EditDepthProvider useOperation OperationProvider useConfig ConfigProvider PageConfigProvider useAuth AuthProvider useLocale LocaleProvider useTranslation TranslationProvider useTheme ThemeProvider defaultTheme useModal useServerFunctions ServerFunctionsProvider ServerFunctionsContext usePreferences PreferencesProvider useParams ParamsProvider useSearchParams SearchParamsProvider useListQuery ListQueryProvider useSelection SelectionProvider useTableColumns TableColumnsProvider useCellProps useRouteCache RouteCacheProvider useRouteTransition RouteTransitionProvider useStepNav SetStepNav SetDocumentTitle SetDocumentStepNav useNav NavProvider NavContext useActions ActionsProvider useClientFunctions useAddClientFunction ClientFunctionProvider useEntityVisibility EntityVisibilityProvider useScrollInfo ScrollInfoProvider useWindowInfo WindowInfoProvider useUploadEdits UploadEditsProvider useUploadControls useUploadHandlers UploadHandlersProvider useFolder FolderProvider useLivePreviewContext LivePreviewProvider useListRelationships RelationshipProvider usePayloadAPI useUseTitleField useDocumentDrawer useDocumentDrawerContext useListDrawer useListDrawerContext ListDrawerContextProvider useBulkUpload useBulkUploadDrawerSlug BulkUploadProvider useDrawerSlug formatDrawerSlug Translation RenderCustomComponent toast parseSearchParams formatTimeToNow escapeDiffHTML getHTMLDiffComponents unescapeDiffHTML',
    ),
    types: names(
      'FieldType Options FormProps FieldAction RowLabelProps DocumentInfoContext DocumentInfoProps UseDocumentDrawer DocumentDrawerProps DocumentTogglerProps UseListDrawer ListDrawerProps ListTogglerProps StepNavItem Theme UserWithToken ServerFunctionsContextType RenderDocumentResult RenderDocumentServerFunction RenderFieldServerFnArgs RenderFieldServerFnReturnType RenderListServerFnArgs RenderListServerFnReturnType UploadHandlersContext BulkUploadProps',
    ),
  },
  tier2: {
    values: names(
      'ArrayField BlocksField CheckboxField CodeField CollapsibleField DateTimeField EmailField GroupField HiddenField JSONField JoinField NumberField PointField RadioGroupField RelationshipField RichTextField RowField SelectField TabsField TextField TextareaField UIField UploadField ConfirmPasswordField PasswordField SlugField CheckboxInput RelationshipInput SelectInput TextInput TextareaInput UploadInput FieldLabel FieldError FieldDescription FieldDiffLabel FieldDiffContainer RowLabel TabComponent TabsProvider fieldComponents allFieldComponents fieldBaseClass isFieldRTL DefaultCell RenderDefaultCell DateCell DefaultListView DefaultEditView BlocksDrawer BlockSelector SectionTitle ItemsDrawer',
    ),
    types: names('TextInputProps TextAreaInputProps UploadInputProps'),
  },
  excluded: {
    values: names(
      'useDebounce useDebouncedCallback useDebouncedEffect useDelay useDelayedRender useHotkey useIntersect useResize useThrottledEffect useEffectEvent useQueue SortHeader SortRow OrderableTable QueryPresetsColumnsCell QueryPresetsWhereCell QueryPresetsAccessCell QueryPresetsGroupByCell QueryPresetsColumnField QueryPresetsWhereField QueryPresetsGroupByField ConfirmationModal Link LeaveWithoutSaving DocumentTakeOver DocumentLocked DatePicker ViewDescription AppHeader BulkUploadDrawer DrawerContentContainer Banner Button AnimateHeight PillSelector Card Collapsible useCollapsible CopyLocaleData CopyToClipboard DeleteMany DocumentControls Dropzone documentDrawerBaseClass useClickOutside useClickOutsideContext useDraggableSortable DraggableSortable DraggableSortableItem DocumentFields Drawer DrawerToggler EditMany ErrorPill FullscreenModal APIKeyGenerationModal GenerateConfirmation Gutter Hamburger HydrateAuthProvider Locked ListControls ListSelection ListHeader GroupByHeader PageControls PageControlsComponent StickyToolbar GroupByPageControls LoadingOverlayToggle FormLoadingOverlayToggle LoadingOverlay Spinner Logout Modal NavToggler NavGroup Pagination PerPage Pill PopupList Popup Combobox PublishMany PublishButton SaveButton SaveDraftButton UnpublishButton BrowseByFolderButton FolderTypeField FolderFileTable ItemCardGrid ReactSelect Select RenderTitle ShimmerEffect StaggeredShimmers SortColumn Table Thumbnail Tooltip UnpublishMany Upload SearchFilter EditUpload FileDetails PreviewSizes PreviewButton RelationshipTable TimezonePicker MoveDocToFolder MoveDocToFolderButton CodeEditorLazy CodeEditor FormSubmit Account PayloadIcon DefaultBlockImage File CalendarIcon CheckIcon ChevronIcon CloseMenuIcon CodeBlockIcon CopyIcon DragHandleIcon EditIcon ExternalLinkIcon LineIcon LinkIcon LogOutIcon MenuIcon MinimizeMaximizeIcon MoreIcon PlusIcon SearchIcon SwapIcon XIcon FolderIcon GearIcon DocumentIcon MoveFolderIcon GridViewIcon ListViewIcon ErrorIcon InfoIcon SuccessIcon WarningIcon ProgressBar RootProvider useControllableState TextCondition SelectCondition RelationshipCondition NumberCondition DateCondition EmailAndUsernameFields SelectAll SelectRow SelectMany DefaultCollectionFolderView DefaultBrowseByFolderView LivePreviewWindow',
    ),
    types: names(
      'OnCancel SelectablePill APIKeyGenerationModalProps GenerateConfirmationProps SpinnerProps ComboboxEntry ComboboxProps ReactSelectOption Column ListViewSlots ListViewClientProps ListComponentClientProps ListComponentServerProps ListPreferences ListHeaderProps',
    ),
  },
};

export const shared = {
  included: {
    values: names(
      'Translation withMergedProps WithServerSideProps mergeFieldStyles reduceToSerializableFields filterFields getInitialColumns abortAndIgnore handleAbortRef requests findLocaleFromCode formatAdminURL formatDate formatDocTitle handleBackToDashboard handleGoBack hasSavePermission isClientUserObject isEditing sanitizeID traverseForLocalizedFields',
    ),
    types: [],
  },
  excluded: {
    values: names(
      'PayloadIcon PayloadLogo getGlobalData getNavGroups getVisibleEntities EntityType groupNavItems handleTakeOver mergeListSearchAndWhere',
    ),
    types: names('EntityToGroup NavGroupType'),
  },
};

export const rsc = {
  included: {
    values: names(
      'FieldDiffContainer FieldDiffLabel escapeDiffHTML getHTMLDiffComponents unescapeDiffHTML getColumns renderFilters renderTable resolveFilterOptions upsertPreferences handlePreview handleLivePreview copyDataFromLocaleHandler',
    ),
    types: [],
  },
  excluded: {
    values: names(
      '_internal_renderFieldHandler File CheckIcon FolderTableCell FolderField getFolderResultsComponentAndData CollectionCards',
    ),
    types: [],
  },
};

export const collisions = names(
  'Button Card Collapsible Select ShimmerEffect StaggeredShimmers Tooltip useHotkey',
);
