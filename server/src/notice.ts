interface Soggetto {
    codice_fiscale: string;
    denominazione_amministrazione?: string;
    denominazione?: string;
}

export interface Committente {
    soggetti_sa: Soggetto[];
    codice_fiscale_sa: Soggetto["codice_fiscale"];
    denominazione_sa: Soggetto["denominazione"];
}

export interface Aggiudicatario {
    oggetto_lotto?: string;
    importo: number;
    soggetti: Soggetto[];
}

export interface Oggetto {
    saTitolare?: boolean;
    tipo_oggetto?: string;
    cig: string;
    natura_principale?: string;
    descrizione?: string;
    luogo_istat?: string;
    valore_affidamento?: number;
    aggiudicatari_ad: Aggiudicatario[];
    comunicazione_annullamento_revoca?: string;
}

export interface Dati {
    procedura_aggiudicazione?: string;
    tipo_procedura_aggiudicazione: string;
}

export interface Content {
    committente: Committente;
    tipo_procedura_aggiudicazione: Dati["tipo_procedura_aggiudicazione"] | undefined;
    items: {
        aggiudicatari_ad?: Aggiudicatario[];
        cig: Oggetto["cig"];
        comunicazione_annullamento_revoca?: Oggetto["comunicazione_annullamento_revoca"];
    }[];
}

