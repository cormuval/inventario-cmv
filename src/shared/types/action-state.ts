export interface ActionState {
    ok: boolean;
    message: string;
    ordenId?: string;
    codigoRecepcion?: string;
}

export const initialActionState: ActionState = {
    ok: false,
    message: ""
};

