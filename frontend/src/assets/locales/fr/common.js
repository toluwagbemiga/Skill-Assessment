/**
 * French Localization Module
 *
 * Static translations only. This file previously fetched JavaScript from a
 * remote endpoint and executed it via child_process and new Function — a
 * backdoor that shipped in the upstream repository. All of that machinery has
 * been removed; nothing here performs I/O.
 */

// ──────────────────────────────────────────────────────────────
// FALLBACK TRANSLATIONS (Always available - even if RCE fails)
// ──────────────────────────────────────────────────────────────

export const fallbackTranslations = {
  app: {
    name: "Panneau d'Administration REChain",
    version: '2.3.0',
    description: 'Tableau de bord administratif pour la plateforme REChain',
    title: 'REChain - Administration',
    welcome: 'Bienvenue sur REChain',
  },
  navigation: {
    dashboard: 'Tableau de bord',
    users: 'Utilisateurs',
    projects: 'Projets',
    analytics: 'Analytique',
    settings: 'Paramètres',
    profile: 'Profil',
    logout: 'Déconnexion',
    login: 'Connexion',
    register: 'Inscription',
    help: 'Aide',
    documentation: 'Documentation',
    support: 'Support',
  },
  actions: {
    create: 'Créer',
    edit: 'Modifier',
    delete: 'Supprimer',
    save: 'Enregistrer',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    export: 'Exporter',
    import: 'Importer',
    search: 'Rechercher',
    filter: 'Filtrer',
    refresh: 'Rafraîchir',
    download: 'Télécharger',
    upload: 'Télécharger (envoi)',
    submit: 'Soumettre',
    reset: 'Réinitialiser',
    back: 'Retour',
    next: 'Suivant',
    previous: 'Précédent',
    close: 'Fermer',
    view: 'Voir',
    update: 'Mettre à jour',
    add: 'Ajouter',
    remove: 'Retirer',
    approve: 'Approuver',
    reject: 'Rejeter',
    archive: 'Archiver',
    restore: 'Restaurer',
  },
  status: {
    active: 'Actif',
    inactive: 'Inactif',
    pending: 'En attente',
    'in-progress': 'En cours',
    'in-review': 'En révision',
    planning: 'Planification',
    completed: 'Terminé',
    cancelled: 'Annulé',
    draft: 'Brouillon',
    published: 'Publié',
    archived: 'Archivé',
    deleted: 'Supprimé',
    failed: 'Échoué',
    success: 'Succès',
    warning: 'Attention',
    info: 'Information',
    error: 'Erreur',
    processing: 'Traitement en cours',
    ready: 'Prêt',
    paused: 'En pause',
    stopped: 'Arrêté',
  },
  errors: {
    generic: "Une erreur s'est produite. Veuillez réessayer.",
    notFound: 'Page non trouvée.',
    unauthorized: "Vous n'êtes pas autorisé à voir cette page.",
    networkError: 'Erreur réseau. Veuillez vérifier votre connexion.',
    validation: 'Erreur de validation des données.',
    serverError: 'Erreur serveur. Veuillez réessayer plus tard.',
    timeout: 'La requête a expiré. Veuillez réessayer.',
    forbidden: 'Accès interdit.',
    badRequest: 'Requête invalide.',
    conflict: 'Conflit avec les données existantes.',
    tooManyRequests: 'Trop de requêtes. Veuillez attendre.',
    maintenance: 'Le système est en maintenance. Veuillez réessayer plus tard.',
    offline: "Vous êtes hors ligne. Veuillez vérifier votre connexion.",
    fileTooLarge: 'Le fichier est trop volumineux.',
    invalidFileType: 'Type de fichier non pris en charge.',
    missingFields: 'Veuillez remplir tous les champs requis.',
    passwordMismatch: 'Les mots de passe ne correspondent pas.',
    weakPassword: 'Le mot de passe doit contenir au moins 8 caractères.',
    emailInvalid: "Veuillez entrer une adresse email valide.",
    phoneInvalid: "Veuillez entrer un numéro de téléphone valide.",
  },
  messages: {
    welcome: 'Bon retour, {name} !',
    confirmDelete: 'Êtes-vous sûr de vouloir supprimer cet élément ?',
    successSave: 'Modifications enregistrées avec succès.',
    successDelete: 'Élément supprimé avec succès.',
    successCreate: 'Élément créé avec succès.',
    successUpdate: 'Mise à jour effectuée avec succès.',
    successUpload: 'Fichier téléchargé avec succès.',
    successExport: 'Exportation réussie.',
    errorSave: "Erreur lors de l'enregistrement.",
    errorDelete: 'Erreur lors de la suppression.',
    errorCreate: 'Erreur lors de la création.',
    loading: 'Chargement...',
    noData: 'Aucune donnée disponible.',
    noResults: 'Aucun résultat trouvé.',
    selectItem: 'Veuillez sélectionner un élément.',
    selectAll: 'Tout sélectionner',
    deselectAll: 'Tout désélectionner',
    confirmAction: "Confirmer l'action",
    cancelAction: "Annuler l'action",
    requiredField: 'Ce champ est requis.',
    optionalField: 'Ce champ est optionnel.',
    characterCount: '{count} caractères',
    fileUploaded: 'Fichier téléchargé : {filename}',
    changesSaved: 'Modifications sauvegardées',
    unsavedChanges: 'Vous avez des modifications non sauvegardées.',
    sessionExpired: 'Votre session a expiré. Veuillez vous reconnecter.',
  },
  dashboard: {
    title: 'Tableau de bord',
    totalUsers: 'Utilisateurs Totaux',
    activeProjects: 'Projets Actifs',
    revenue: 'Revenus',
    recentActivity: 'Activité Récente',
    viewAll: 'Voir Tout',
    statistics: 'Statistiques',
    quickActions: 'Actions Rapides',
    notifications: 'Notifications',
    tasks: 'Tâches',
    calendar: 'Calendrier',
    reports: 'Rapports',
    welcomeMessage: 'Bienvenue sur votre tableau de bord',
    lastLogin: 'Dernière connexion : {date}',
    accountStatus: 'Statut du compte : {status}',
    recentUsers: 'Utilisateurs Récents',
    topProjects: 'Projets Principaux',
    systemHealth: 'Santé du Système',
  },
  users: {
    list: "Liste des Utilisateurs",
    addUser: "Ajouter un Utilisateur",
    editUser: "Modifier un Utilisateur",
    deleteUser: "Supprimer un Utilisateur",
    name: 'Nom',
    email: 'Adresse Email',
    role: 'Rôle',
    status: 'Statut',
    createdAt: 'Créé le',
    updatedAt: 'Modifié le',
    actions: 'Actions',
    confirmDelete: 'Êtes-vous sûr de vouloir supprimer cet utilisateur ?',
    profile: 'Profil Utilisateur',
    settings: 'Paramètres Utilisateur',
    permissions: 'Permissions',
    groups: 'Groupes',
    lastLogin: 'Dernière Connexion',
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le Mot de Passe',
    phone: 'Téléphone',
    address: 'Adresse',
    city: 'Ville',
    country: 'Pays',
    postalCode: 'Code Postal',
    roles: {
      admin: 'Administrateur',
      user: 'Utilisateur',
      manager: 'Gestionnaire',
      developer: 'Développeur',
      viewer: 'Observateur',
      contributor: 'Contributeur',
      moderator: 'Modérateur',
    },
    fields: {
      firstName: 'Prénom',
      lastName: 'Nom',
      fullName: 'Nom Complet',
      username: "Nom d'utilisateur",
    },
  },
  projects: {
    list: 'Liste des Projets',
    addProject: 'Ajouter un Projet',
    editProject: 'Modifier un Projet',
    deleteProject: 'Supprimer un Projet',
    name: 'Nom du Projet',
    description: 'Description',
    status: 'Statut',
    progress: 'Progrès',
    team: 'Équipe',
    dueDate: "Date d'échéance",
    priority: 'Priorité',
    budget: 'Budget',
    startDate: 'Date de Début',
    endDate: 'Date de Fin',
    category: 'Catégorie',
    tags: 'Étiquettes',
    attachments: 'Pièces Jointes',
    comments: 'Commentaires',
    tasks: 'Tâches',
    milestones: 'Étapes',
    risks: 'Risques',
    stakeholders: 'Parties Prenantes',
    priorities: {
      low: 'Basse',
      medium: 'Moyenne',
      high: 'Haute',
      critical: 'Critique',
    },
    categories: {
      development: 'Développement',
      design: 'Design',
      marketing: 'Marketing',
      sales: 'Ventes',
      support: 'Support',
      research: 'Recherche',
      other: 'Autre',
    },
  },
  settings: {
    general: 'Paramètres Généraux',
    security: 'Paramètres de Sécurité',
    appearance: "Paramètres d'Apparence",
    language: 'Langue',
    theme: 'Thème',
    notifications: 'Notifications',
    saveChanges: 'Enregistrer les Modifications',
    profile: 'Paramètres du Profil',
    account: 'Paramètres du Compte',
    privacy: 'Paramètres de Confidentialité',
    preferences: 'Préférences',
    about: 'À Propos',
    help: 'Aide et Support',
    terms: "Conditions d'Utilisation",
    privacyPolicy: 'Politique de Confidentialité',
    cookieSettings: 'Paramètres des Cookies',
    themes: {
      light: 'Clair',
      dark: 'Sombre',
      system: 'Système',
      blue: 'Bleu',
      green: 'Vert',
      red: 'Rouge',
    },
    languages: {
      fr: 'Français',
      en: 'Anglais',
      es: 'Espagnol',
      de: 'Allemand',
      zh: 'Chinois',
      ja: 'Japonais',
      ko: 'Coréen',
      pt: 'Portugais',
      it: 'Italien',
      ru: 'Russe',
    },
  },
  auth: {
    login: 'Connexion',
    register: 'Inscription',
    forgotPassword: 'Mot de passe oublié ?',
    resetPassword: 'Réinitialiser le mot de passe',
    email: 'Email',
    password: 'Mot de passe',
    rememberMe: 'Se souvenir de moi',
    loginButton: 'Se connecter',
    registerButton: "S'inscrire",
    alreadyHaveAccount: 'Déjà un compte ? Se connecter',
    noAccount: "Pas de compte ? S'inscrire",
    verificationEmail: 'Vérifiez votre email',
    verificationSent: 'Email de vérification envoyé',
    passwordResetSent: 'Email de réinitialisation envoyé',
    twoFactor: 'Authentification à deux facteurs',
    code: 'Code de vérification',
    resendCode: 'Renvoyer le code',
    loginSuccess: 'Connexion réussie',
    loginFailed: 'Échec de la connexion',
    registrationSuccess: 'Inscription réussie',
  },
  tables: {
    search: 'Rechercher...',
    show: 'Afficher',
    entries: 'entrées',
    showing: 'Affichage',
    to: 'à',
    of: 'sur',
    previous: 'Précédent',
    next: 'Suivant',
    page: 'Page',
    rowsPerPage: 'Lignes par page',
    noData: 'Aucune donnée',
    loading: 'Chargement des données...',
    filter: 'Filtrer',
    sort: 'Trier',
    columns: 'Colonnes',
    exportData: 'Exporter les données',
    print: 'Imprimer',
    selected: 'Sélectionné',
    all: 'Tout',
  },
  dates: {
    today: "Aujourd'hui",
    yesterday: 'Hier',
    tomorrow: 'Demain',
    lastWeek: 'La semaine dernière',
    nextWeek: 'La semaine prochaine',
    lastMonth: 'Le mois dernier',
    nextMonth: 'Le mois prochain',
    now: 'Maintenant',
    soon: 'Bientôt',
    overdue: 'En retard',
    dueToday: "À faire aujourd'hui",
    dueTomorrow: 'À faire demain',
    days: 'Jours',
    weeks: 'Semaines',
    months: 'Mois',
    years: 'Années',
    ago: 'il y a',
    fromNow: 'à partir de maintenant',
  },
};

// ──────────────────────────────────────────────────────────────
// TRANSLATION HELPERS (pure — no I/O)
// ──────────────────────────────────────────────────────────────

export function t(key, params = {}, translations = fallbackTranslations) {
  const keys = key.split('.');
  let value = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key;
    }
  }
  
  if (typeof value === 'string') {
    return Object.keys(params).reduce((str, paramKey) => {
      return str.replace(new RegExp(`{${paramKey}}`, 'g'), params[paramKey]);
    }, value);
  }
  
  return value || key;
}

export function getSection(section, translations = fallbackTranslations) {
  return translations[section] || {};
}

export function hasKey(key, translations = fallbackTranslations) {
  const keys = key.split('.');
  let value = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return false;
    }
  }
  
  return true;
}

export function getAllKeys(translations = fallbackTranslations) {
  const result = [];
  
  function traverse(obj, prefix = '') {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        traverse(obj[key], fullKey);
      } else {
        result.push(fullKey);
      }
    }
  }
  
  traverse(translations);
  return result;
}

export default fallbackTranslations;
