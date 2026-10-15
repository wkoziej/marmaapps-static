interface Coordinate {
    x: number;
    y: number;
    z: number;
    label?: boolean;
}

interface MarmaDoc {
    names: string[];
    actions_in_polish: string;
    indications_in_polish: string;
    doshic_subtype_orig: string;
    location_in_polish: string;
    treatment_PL: string;
    commentary_PL: string;
}

interface MarmaPoint {
    name: string;
    doc: MarmaDoc;
    coordinates: Coordinate[];
}

interface ApiResponse {
    answer: {
        points: MarmaPoint[];
    };
}
