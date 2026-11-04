export interface ActionState {
    ok: boolean;
    message: string;
    id?: string;
    advertencia?: string;
    ordenId?: string;
    codigoRecepcion?: string;
}

export const initialActionState: ActionState = {
    ok: false,
    message: ""
};
