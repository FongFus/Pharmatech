const ACTION_TYPES = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  UPDATE_USER: 'update_user',
};

const MyUserReducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.LOGIN:
      return {
        user: action.payload.user,
        token: action.payload.token,
      };
    case ACTION_TYPES.LOGOUT:
      return { user: null, token: null };
    case ACTION_TYPES.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };
    default:
      return state;
  }
};

export default MyUserReducer;