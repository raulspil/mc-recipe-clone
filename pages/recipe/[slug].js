import { getRecipe } from '../../lib/ephemeralStore';

export async function getServerSideProps(context) {
  const { slug } = context.params;
  const recipe = getRecipe(slug);

  if (!recipe) {
    return {
      props: {
        notFound: true,
      },
    };
  }

  return {
    props: {
      html: recipe.html,
      notFound: false,
    },
  };
}

export default function RecipePage({ html, notFound }) {
  if (notFound) {
    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', textAlign: 'center' }}>
        <h1>Recipe Not Found or Expired</h1>
        <p>This recipe is no longer available. Please generate it again if needed.</p>
      </div>
    );
  }
  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  );
} 