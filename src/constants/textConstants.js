export const ErrorMessages = {
    NO_INPUT: "Wpisz dolegliwość, doshę lub nazwę punktu marma",
    NO_RESULTS: "Nie znaleziono odpowiedzi",
    API_ERROR: "Wystąpił błąd podczas pobierania danych",
    BAD_REQUEST: "Nieprawidłowa fraza wyszukiwania (pusta lub za długa)",
    SESSION_EXPIRED: "Sesja wygasła. Zaloguj się ponownie.",
    FORBIDDEN: "Brak dostępu. Ten adres e-mail nie jest na liście dozwolonych.",
    TOO_MANY_REQUESTS: "Za dużo zapytań. Spróbuj ponownie za chwilę.",
    SERVICE_UNAVAILABLE: "Wyszukiwanie jest chwilowo niedostępne. Spróbuj ponownie później."
};

export const SectionTitles = {
    LOCATION: "Lokalizacja",
    ACTIONS: "Działania",
    INDICATIONS: "Wskazania",
    TREATMENT: "Leczenie",
    COMMENTARY: "Komentarz",
    DOSHIC_SUBTYPE: "Typy poddoszy"
};

export const UiTexts = {
    SEARCHING: "Szukam...",
    EMPTY_RESULTS: "Brak wyników",
    MODEL_LOAD_ERROR: "Nie udało się wczytać modelu 3D"
};

/** Komunikaty logowania (src/auth/loginPage.js). */
export const AuthMessages = {
    TITLE: "Zaloguj się",
    INTRO: "Dostęp mają tylko osoby z listy dozwolonych adresów. Logowanie nie wymaga hasła.",
    EMAIL_LABEL: "Adres e-mail",
    EMAIL_BUTTON: "Wyślij link logowania",
    GOOGLE_BUTTON: "Zaloguj przez Google",
    OR: "lub",
    SENDING: "Wysyłam link...",
    EMAIL_REQUIRED: "Wpisz adres e-mail.",
    LINK_SENT: "Wysłaliśmy link logowania. Sprawdź skrzynkę e-mail (także folder spam) i otwórz link w tej samej przeglądarce.",
    NOT_ALLOWED: "Ten adres e-mail nie ma dostępu do aplikacji. Aby uzyskać dostęp, skontaktuj się z właścicielem aplikacji.",
    NETWORK: "Brak połączenia z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.",
    RATE_LIMIT: "Zbyt wiele prób logowania. Odczekaj minutę i spróbuj ponownie.",
    GOOGLE_ERROR: "Logowanie przez Google nie powiodło się. Spróbuj ponownie lub użyj linku e-mail.",
    LINK_INVALID: "Link logowania wygasł, został już użyty lub otwarto go w innej przeglądarce. Poproś o nowy link w tej przeglądarce.",
    GENERIC: "Logowanie nie powiodło się. Spróbuj ponownie."
};
